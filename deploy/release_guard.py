"""Image-only release operations. stdlib only; report/dry-run by default.

No shell, pull, build, migration, volume deletion, or global prune commands.
Runtime/config snapshots are PRIVATE (0600); never upload them to CI artifacts.
"""
import argparse
import contextlib
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.request

GIB = 1024 ** 3
SCOPES = {
    'qavio': ('web', 'worker', 'qavio-postgres', 'qavio-web'),
    'restaurant': ('app', 'maintenance-worker', 'postgres', 'quanpilot-app'),
}
CLEAN_REPOS = {'qavio-web', 'quanpilot-app', 'qavio-staging-web'}


def need(condition, code):
    if not condition:
        raise ValueError(code)


def run(args, env=None):
    p = subprocess.run(args, env=env, capture_output=True, text=True)
    # Docker/Compose stderr may contain resolved environment. Never echo it.
    need(p.returncode == 0, 'COMMAND_FAILED_' + args[0])
    return p.stdout.strip()


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def stable(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def private_json(path, value):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    need(not p.exists(), 'REFUSE_OVERWRITE_SNAPSHOT')
    fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(value, f, indent=2)


def inspect(ref, kind='container'):
    return json.loads(run(['docker', kind, 'inspect', ref]))[0]


def containers():
    ids = run(['docker', 'ps', '-aq']).split()
    return json.loads(run(['docker', 'inspect', *ids])) if ids else []


def archive_config(path):
    with tarfile.open(path, 'r:gz') as t:
        manifests = json.load(t.extractfile('manifest.json'))
        need(len(manifests) == 1, 'ONE_IMAGE_REQUIRED')
        raw = t.extractfile(manifests[0]['Config']).read()
        return json.loads(raw), hashlib.sha256(raw).hexdigest(), manifests[0]['RepoTags']


def rootfs(cfg):
    return {'Type': cfg['rootfs']['type'], 'Layers': cfg['rootfs']['diff_ids']}


def package(directory, scope, sha):
    need(re.fullmatch('[0-9a-f]{40}', sha), 'FULL_SOURCE_SHA_REQUIRED')
    root = Path(directory)
    archive = root / ('qavio-images.tar.gz' if scope == 'qavio' else 'quanpilot-images.tar.gz')
    image = json.loads((root / 'images.json').read_text())[0]
    cfg, cfg_hash, tags = archive_config(archive)
    ref = SCOPES[scope][3] + ':' + sha[:7]
    need(tags == [ref] and image['revision'] == sha, 'SOURCE_TAG_MISMATCH')
    need(cfg['config']['Labels']['org.opencontainers.image.revision'] == sha, 'REVISION_MISMATCH')
    need(cfg['os'] == 'linux' and cfg['architecture'] == 'amd64', 'LINUX_AMD64_REQUIRED')
    manifest = {'format': 1, 'scope': scope, 'sourceSha': sha, 'image': ref,
                'archive': archive.name, 'archiveBytes': archive.stat().st_size,
                'archiveSha256': digest(archive), 'imageBytes': image['size'],
                'configSha256': cfg_hash, 'rootfs': rootfs(cfg),
                'platform': 'linux/amd64'}
    private_json(root / 'release-manifest.json', manifest)
    # Allowlist only release payloads: no secrets, source checkout or environment.
    need(set(p.name for p in root.iterdir()) <=
         {archive.name, 'images.json', 'release-manifest.json', 'SHA256SUMS'}, 'UNEXPECTED_RELEASE_FILE')
    (root / 'SHA256SUMS').write_text(''.join(digest(root / n) + '  ' + n + '\n'
        for n in [archive.name, 'images.json', 'release-manifest.json']), encoding='utf-8')
    return {'sourceSha': sha, 'manifestSha256': digest(root / 'release-manifest.json')}


def verify(directory, sha, manifest_sha):
    root = Path(directory)
    need(re.fullmatch('[0-9a-f]{40}', sha), 'FULL_SOURCE_SHA_REQUIRED')
    need(re.fullmatch('[0-9a-f]{64}', manifest_sha), 'APPROVED_MANIFEST_DIGEST_REQUIRED')
    need(digest(root / 'release-manifest.json') == manifest_sha, 'MANIFEST_DIGEST_MISMATCH')
    m = json.loads((root / 'release-manifest.json').read_text())
    need(m['format'] == 1 and m['sourceSha'] == sha and m['scope'] in SCOPES, 'SOURCE_SCOPE_MISMATCH')
    need(m['image'] == SCOPES[m['scope']][3] + ':' + sha[:7], 'IMAGE_REF_MISMATCH')
    need(m['archive'] in ['qavio-images.tar.gz', 'quanpilot-images.tar.gz'], 'BAD_ARCHIVE_PATH')
    path = root / m['archive']
    need(path.stat().st_size == m['archiveBytes'] and digest(path) == m['archiveSha256'], 'ARCHIVE_MISMATCH')
    cfg, cfg_hash, tags = archive_config(path)
    need(cfg_hash == m['configSha256'] and rootfs(cfg) == m['rootfs'], 'IMAGE_CONFIG_MISMATCH')
    need(cfg['config']['Labels']['org.opencontainers.image.revision'] == sha, 'REVISION_MISMATCH')
    need(tags == [m['image']] and cfg['os'] == 'linux' and cfg['architecture'] == 'amd64', 'PLATFORM_TAG_MISMATCH')
    # Upper bound includes every uncompressed archive member, not only shared layers.
    with tarfile.open(path, 'r:gz') as t:
        unpacked = sum(x.size for x in t)
    need(m['imageBytes'] > 0 and m['archiveBytes'] > 0, 'BAD_SIZE')
    m['unpackedBytes'] = unpacked
    return m


def disk_gate(total, free, incoming, available_memory):
    used = 100 * (total - free) / total
    # Existing rollback images remain on disk; never count reclaimable bytes as free.
    reserve = max(1536 * 1024 ** 2, int(total * .10))
    needed = incoming + reserve
    return {'usedPercent': round(used, 2), 'freeBytes': free, 'incomingUpperBoundBytes': incoming,
            'reserveBytes': reserve, 'requiredFreeBytes': needed,
            'severity': 'critical' if used > 90 else 'warning' if used > 80 else 'ok',
            'allowed': used <= 90 and free >= needed and available_memory >= 256 * 1024 ** 2,
            'memoryAvailableBytes': available_memory}


def memory_available():
    lines = Path('/proc/meminfo').read_text().splitlines()
    return int(next(x.split()[1] for x in lines if x.startswith('MemAvailable:'))) * 1024


def directory_bytes(path):
    # Read sizes only. Do not follow symlinks into other filesystems or secrets.
    p = Path(path)
    if not p.exists():
        return None
    return int(run(['du', '-sx', '--block-size=1', str(p)]).split()[0])


def inventory():
    cs = containers()
    rows = []
    for x in cs:
        logs = Path(x['LogPath']).parent if x.get('LogPath') else None
        rows.append({'name': x['Name'].lstrip('/'), 'image': x['Config']['Image'],
                     'imageId': x['Image'], 'running': x['State']['Running'],
                     'oomKilled': x['State'].get('OOMKilled'), 'memoryLimit': x['HostConfig']['Memory'],
                     'logPolicy': x['HostConfig']['LogConfig'],
                     'logDirectoryBytes': directory_bytes(logs) if logs else None,
                     'persistentStorage': [{'destination': z['Destination'], 'type': z['Type'],
                        'bytes': directory_bytes(z['Source'])} for z in x['Mounts']
                        if z['Type'] in ['volume', 'bind'] and Path(z['Source']).is_dir()]})
    usage = shutil.disk_usage('/')
    paths = ['/opt/websites/qavio/.runtime', '/opt/websites/restaurant/.trial-runtime',
             '/opt/websites/qavio/backups', '/opt/websites/restaurant/backups',
             '/opt/websites/restaurant/runtime', '/root/.npm', '/root/.cache']
    return {'disk': disk_gate(usage.total, usage.free, 0, memory_available()), 'containers': rows,
            'dockerStorage': run(['docker', 'system', 'df']),
            'memorySamples': run(['docker', 'stats', '--no-stream', '--format', '{{json .}}']),
            'directories': {p: directory_bytes(p) for p in paths}}


def cleanup_plan(images, cs, rollback):
    protected = {x['Image'] for x in cs}  # includes stopped containers
    for repo in ['qavio-web', 'quanpilot-app']:
        entry = rollback.get(repo, {})
        need(entry.get('verified') is True and entry.get('ref', '').startswith(repo + ':'), 'VERIFIED_ROLLBACK_REQUIRED')
        matches = [x for x in images if entry['ref'] in (x.get('RepoTags') or []) and x['Id'] == entry.get('id')]
        need(len(matches) == 1, 'ROLLBACK_MISSING_OR_CHANGED')
        need(entry['id'] not in {x['Image'] for x in cs if x['State']['Running'] and x['Config']['Image'].startswith(repo + ':')},
             'ROLLBACK_MUST_DIFFER_FROM_RUNNING')
        protected.add(entry['id'])
    candidates = []
    for x in images:
        tags = x.get('RepoTags') or []
        if x['Id'] in protected or not tags:
            continue
        if all(t.rsplit(':', 1)[0] in CLEAN_REPOS for t in tags):
            candidates.append({'id': x['Id'], 'tags': sorted(tags), 'sizeBytes': x['Size']})
    plan = {'candidates': sorted(candidates, key=lambda x: x['id']), 'rollback': rollback,
            'protectedIds': sorted(protected)}
    return {**plan, 'confirmation': stable(plan), 'mode': 'dry-run'}


def images():
    ids = sorted(set(run(['docker', 'image', 'ls', '-aq', '--no-trunc']).split()))
    return json.loads(run(['docker', 'image', 'inspect', *ids])) if ids else []


def cleanup(rollback_path, approval=None):
    rb = json.loads(Path(rollback_path).read_text())
    plan = cleanup_plan(images(), containers(), rb)
    if approval is None:
        return plan
    need(approval == plan['confirmation'], 'CLEANUP_PLAN_CHANGED_REVIEW_AGAIN')
    for candidate in plan['candidates']:
        # Recheck ALL tags/containers/rollback immediately before deleting each ID.
        fresh = cleanup_plan(images(), containers(), rb)
        need(candidate in fresh['candidates'], 'IMAGE_BECAME_PROTECTED')
        run(['docker', 'image', 'rm', *candidate['tags']])  # never --force
    return {'mode': 'applied', 'deleted': plan['candidates'], 'confirmation': approval}


def runtime_equal(before, after, target):
    need(set(before['services']) == set(after['services']), 'SERVICE_SCOPE_CHANGED')
    for key in set(before) | set(after):
        if key != 'services':
            need(before.get(key) == after.get(key), 'NETWORK_VOLUME_PROJECT_CHANGED')
    for name, old in before['services'].items():
        new = after['services'][name]
        need(not new.get('build') and new.get('pull_policy') == 'never', 'IMAGE_ONLY_REQUIRED')
        need(new.get('image'), 'IMAGE_REQUIRED')
        for key in set(old) | set(new):
            if key not in {'build', 'image', 'pull_policy', 'logging'}:
                need(old.get(key) == new.get(key), 'RUNTIME_CHANGED_' + name + '_' + key)
        need(new['logging'] == {'driver': 'json-file', 'options': {'max-size': '10m', 'max-file': '3'}},
             'BOUNDED_JSON_LOGS_REQUIRED')
        need(old.get('logging', {}).get('driver', 'json-file') == 'json-file', 'LOG_DRIVER_CHANGE_REQUIRES_REVIEW')


def snapshot(cs):
    return {x['Name']: {'id': x['Id'], 'image': x['Image'], 'started': x['State']['StartedAt'],
                        'restarts': x['RestartCount']} for x in cs}


@contextlib.contextmanager
def mutation_lock():
    # Shared across both repositories; concurrent releases/cleanup must not race.
    import fcntl
    with open('/run/lock/qavio-release.lock', 'a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('ANOTHER_RELEASE_OR_CLEANUP_IS_RUNNING') from None
        yield


def request_ok(url, expected=200):
    # Same TLS-verified curl probe used by existing production runbooks.
    # No redirect following: a redirect is not a readiness success.
    code = run(['curl', '--silent', '--show-error', '--max-time', '10',
                '--output', os.devnull, '--write-out', '%{http_code}', url])
    need(code == str(expected), 'HTTP_CHECK_FAILED_' + code)


def deploy(args):
    need(sys.platform == 'linux', 'LINUX_HOST_REQUIRED')
    m = verify(args.directory, args.sha, args.manifest_sha)
    scope = m['scope']
    service, worker, pg, _ = SCOPES[scope]
    root = Path(args.project_dir).resolve()
    cs = containers()
    members = {x['Config'].get('Labels', {}).get('com.docker.compose.service'): x for x in cs
               if x['Config'].get('Labels', {}).get('com.docker.compose.project') == scope and x['State']['Running']}
    need(all(n in members for n in [service, worker, pg]), 'EXPECTED_PROJECT_NOT_RUNNING')
    need(all(members[n]['HostConfig']['LogConfig']['Type'] == 'json-file' for n in [service, worker, pg]),
         'LOG_DRIVER_REQUIRES_REVIEW')
    old = members[service]
    rollback = inspect(args.rollback_image, 'image')
    need(rollback['Id'] == old['Image'], 'ROLLBACK_MUST_BE_CURRENT_VERIFIED_IMAGE')
    command = ['docker', 'compose', '--project-directory', str(root), '-p', scope]
    for f in args.base:
        path = Path(f).resolve()
        need(path.is_relative_to(root), 'COMPOSE_OUTSIDE_PROJECT')
        command += ['-f', str(path)]
    env = {**os.environ, 'RELEASE_IMAGE': m['image'],
           'RELEASE_WORKER_IMAGE': members[worker]['Config']['Image'],
           'RELEASE_POSTGRES_IMAGE': members[pg]['Config']['Image']}
    before = json.loads(run(command + ['--profile', '*', 'config', '--format', 'json'], env))
    overlay = root / 'compose.image-only.yaml'
    after = json.loads(run(command + ['-f', str(overlay), '--profile', '*', 'config', '--format', 'json'], env))
    runtime_equal(before, after, service)
    actual_env = dict(v.split('=', 1) for v in old['Config']['Env'])
    expected_env = before['services'][service].get('environment', {})
    need(all(actual_env.get(k) == str(v) for k, v in expected_env.items() if v is not None),
         'LIVE_ENV_DIFFERS_FROM_COMPOSE_REVIEW_FIRST')
    # Every unrelated image must already be local and still match its running ID.
    for name in [worker, pg]:
        need(inspect(after['services'][name]['image'], 'image')['Id'] == members[name]['Image'], 'DEPENDENCY_IMAGE_CHANGED')
    usage = shutil.disk_usage(root)
    gate = disk_gate(usage.total, usage.free, max(m['unpackedBytes'], m['imageBytes']), memory_available())
    need(gate['allowed'], 'DISK_OR_RAM_PREFLIGHT_BLOCKED')
    token = args.sha + ':' + args.manifest_sha
    report = {'mode': 'dry-run', 'scope': scope, 'service': service, 'image': m['image'],
              'disk': gate, 'runtimePreserved': True, 'requiresApproval': token,
              'loggingDeferredServices': [worker, pg], 'migration': 'never'}
    if args.approve is None:
        return report
    need(args.approve == token, 'EXACT_RELEASE_APPROVAL_REQUIRED')
    need(args.snapshot_dir, 'PRIVATE_SNAPSHOT_DIRECTORY_REQUIRED')
    snap = Path(args.snapshot_dir).resolve()
    private_root = root / ('.runtime' if scope == 'qavio' else '.trial-runtime')
    need(snap.is_relative_to(private_root) and snap != private_root, 'SNAPSHOT_MUST_BE_IN_IGNORED_PRIVATE_RUNTIME')
    need(not snap.exists(), 'FRESH_SNAPSHOT_DIRECTORY_REQUIRED')
    snap.mkdir(parents=True, mode=0o700)
    # Compose JSON may contain secrets; keep private, never print/upload it.
    private_json(snap / 'before.json', before)
    private_json(snap / 'after.json', after)
    old_config = copy.deepcopy(after)
    old_config['services'][service]['image'] = args.rollback_image
    old_config['services'][service]['logging'] = before['services'][service].get('logging', {'driver': 'json-file'})
    private_json(snap / 'rollback.json', old_config)
    baseline = snapshot(cs)
    run(['docker', 'load', '-i', str(Path(args.directory) / m['archive'])])
    loaded = inspect(m['image'], 'image')
    cfg, _, _ = archive_config(Path(args.directory) / m['archive'])
    need(loaded['Config']['Labels']['org.opencontainers.image.revision'] == args.sha and
         loaded['RootFS'] == m['rootfs'] and loaded['Config'] == cfg['config'], 'LOADED_IMAGE_MISMATCH')
    pinned = copy.deepcopy(after)
    pinned['services'][service]['image'] = loaded['Id']
    private_json(snap / 'pinned.json', pinned)
    old_config['services'][service]['image'] = rollback['Id']
    private_json(snap / 'rollback-pinned.json', old_config)
    # Check generated model still valid and no changed volumes/networks/environment.
    up = ['docker', 'compose', '--project-directory', str(root), '-p', scope, '-f']
    try:
        run(up + [str(snap / 'pinned.json'), 'up', '-d', '--no-build', '--pull', 'never', '--no-deps', service])
        port = 3100 if scope == 'qavio' else 3000
        paths = ['/api/ready', '/pricing', '/api/public/pricing'] if scope == 'qavio' else ['/restaurant-login', '/api/public/pricing']
        for attempt in range(45):
            try:
                for path in paths:
                    request_ok('http://127.0.0.1:' + str(port) + path)
                live = inspect(old['Name'])
                need(live['Image'] == loaded['Id'], 'WRONG_LIVE_IMAGE')
                need(live['State'].get('Health', {}).get('Status', 'healthy') == 'healthy', 'HEALTH_NOT_READY')
                break
            except Exception:
                if attempt == 44:
                    raise
                time.sleep(2)
        public = 'https://qavio.site' if scope == 'qavio' else 'https://admin.qavio.site'
        for path in paths:
            request_ok(public + path)
        now = snapshot(containers())
        need(set(now) == set(baseline), 'CONTAINER_SET_CHANGED')
        need(all(now[n] == b for n, b in baseline.items() if n != old['Name']), 'UNRELATED_CONTAINER_CHANGED')
        need(sorted(inspect(old['Name'])['Mounts'], key=lambda x: x['Destination']) ==
             sorted(old['Mounts'], key=lambda x: x['Destination']), 'MOUNTS_CHANGED')
    except Exception:
        try:
            run(up + [str(snap / 'rollback-pinned.json'), 'up', '-d', '--no-build', '--pull', 'never', '--no-deps', service])
            for attempt in range(45):
                try:
                    for path in paths:
                        request_ok('http://127.0.0.1:' + str(port) + path)
                    need(inspect(old['Name'])['Image'] == rollback['Id'], 'ROLLBACK_IMAGE_MISMATCH')
                    break
                except Exception:
                    if attempt == 44:
                        raise
                    time.sleep(2)
        except Exception:
            raise ValueError('RELEASE_FAILED_ROLLBACK_UNHEALTHY_MANUAL_RECOVERY_REQUIRED') from None
        raise ValueError('RELEASE_FAILED_ROLLBACK_HTTP_VERIFIED') from None
    report.update(mode='applied', healthy=True, unrelatedContainersUnchanged=True)
    private_json(snap / 'result.json', report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='op', required=True)
    p = sub.add_parser('package')
    p.add_argument('--directory', required=True)
    p.add_argument('--scope', choices=SCOPES, required=True)
    p.add_argument('--sha', required=True)
    p = sub.add_parser('verify')
    p.add_argument('--directory', required=True)
    p.add_argument('--sha', required=True)
    p.add_argument('--manifest-sha', required=True)
    sub.add_parser('inventory')
    p = sub.add_parser('capacity', help='Before transfer: budget incoming image plus ZIP/tar staging and reserve')
    p.add_argument('--archive-bytes', type=int, required=True)
    p.add_argument('--image-bytes', type=int, required=True)
    p.add_argument('--path', default='/opt/websites')
    p = sub.add_parser('cleanup')
    p.add_argument('--rollback-file', required=True)
    p.add_argument('--confirm-plan', help='Absent: dry-run. Exact reviewed plan hash: delete listed tags only.')
    p = sub.add_parser('deploy')
    for field in ['directory', 'sha', 'manifest-sha', 'project-dir', 'rollback-image']:
        p.add_argument('--' + field, required=True)
    p.add_argument('--base', action='append', required=True)
    p.add_argument('--snapshot-dir')
    p.add_argument('--approve', help='Absent: dry-run. Exact SHA:manifest digest is required to mutate.')
    args = parser.parse_args()
    if args.op == 'package':
        result = package(args.directory, args.scope, args.sha)
    elif args.op == 'verify':
        result = verify(args.directory, args.sha, args.manifest_sha)
    elif args.op == 'inventory':
        result = inventory()
    elif args.op == 'capacity':
        need(args.archive_bytes > 0 and args.image_bytes > 0, 'POSITIVE_RELEASE_SIZES_REQUIRED')
        usage = shutil.disk_usage(args.path)
        result = disk_gate(usage.total, usage.free, args.image_bytes + 2 * args.archive_bytes, memory_available())
        print(json.dumps(result, indent=2))
        need(result['allowed'], 'DISK_OR_RAM_PREFLIGHT_BLOCKED')
        return
    elif args.op == 'cleanup':
        if args.confirm_plan:
            with mutation_lock():
                result = cleanup(args.rollback_file, args.confirm_plan)
        else:
            result = cleanup(args.rollback_file)
    else:
        if args.approve:
            with mutation_lock():
                result = deploy(args)
        else:
            result = deploy(args)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # Do not leak command stderr, URLs with tokens, environment or config.
        print('RELEASE_GUARD_BLOCKED: ' + (str(exc) if isinstance(exc, ValueError) else type(exc).__name__), file=sys.stderr)
        sys.exit(1)
