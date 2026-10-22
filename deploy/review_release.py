"""GitHub-hosted/manual release review. Downloads artifacts, never accesses VPS.

GITHUB_TOKEN is read from environment only. No token or signed URL is printed.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.request
import zipfile
from release_guard import need, verify, private_json


def validate_run(run, repo, scope, sha):
    workflow = '.github/workflows/' + ('qavio-release.yml' if scope == 'qavio' else 'quanpilot-release.yml')
    need(run['head_sha'] == sha and run['head_branch'] == 'main' and run['event'] == 'workflow_dispatch' and
         run['status'] == 'completed' and run['conclusion'] == 'success' and run['path'] == workflow and
         run['repository']['full_name'] == repo, 'UNAPPROVED_SOURCE_RUN')


def review(repo, scope, run_id, sha, output):
    need(repo == 'herry-huynhlong/' + ('qavio' if scope == 'qavio' else 'restaurant'), 'REPOSITORY_SCOPE')
    need(re.fullmatch('[0-9a-f]{40}', sha) and str(run_id).isdigit(), 'EXACT_RUN_SHA_REQUIRED')
    token = os.environ['GITHUB_TOKEN']

    def api(path):
        req = urllib.request.Request('https://api.github.com/repos/' + repo + path,
            headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json'})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read()

    run = json.loads(api('/actions/runs/' + str(run_id)))
    validate_run(run, repo, scope, sha)
    name = ('qavio' if scope == 'qavio' else 'quanpilot') + '-linux-release-' + sha
    artifacts = json.loads(api('/actions/runs/' + str(run_id) + '/artifacts'))['artifacts']
    selected = [a for a in artifacts if a['name'] == name and not a['expired']]
    need(len(selected) == 1, 'ARTIFACT_UNAVAILABLE_OR_AMBIGUOUS')
    a = selected[0]
    # urllib strips Authorization on a cross-host redirect? Do not depend on it:
    # intercept API redirect, then fetch the signed URL WITHOUT the GitHub token.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    req = urllib.request.Request('https://api.github.com/repos/' + repo + '/actions/artifacts/' + str(a['id']) + '/zip',
                                 headers={'Authorization': 'Bearer ' + token})
    try:
        urllib.request.build_opener(NoRedirect).open(req, timeout=30)
        raise ValueError('EXPECTED_SIGNED_REDIRECT')
    except urllib.error.HTTPError as e:
        need(e.code == 302, 'ARTIFACT_DOWNLOAD_DENIED')
        location = e.headers['Location']
    need(location.startswith('https://'), 'HTTPS_ARTIFACT_REQUIRED')
    with urllib.request.urlopen(location, timeout=120) as response:
        payload = response.read()
    need(a.get('digest') == 'sha256:' + hashlib.sha256(payload).hexdigest(), 'GITHUB_ARTIFACT_DIGEST_MISMATCH')
    root = Path(output)
    need(not root.exists(), 'FRESH_OUTPUT_DIRECTORY_REQUIRED')
    root.mkdir(parents=True, mode=0o700)
    archive = 'qavio-images.tar.gz' if scope == 'qavio' else 'quanpilot-images.tar.gz'
    allowed = {archive, 'images.json', 'release-manifest.json', 'SHA256SUMS'}
    with zipfile.ZipFile(io.BytesIO(payload)) as z:
        need(set(z.namelist()) == allowed and len(z.namelist()) == len(allowed), 'UNEXPECTED_ARTIFACT_FILES')
        for name in allowed:
            (root / name).write_bytes(z.read(name))
    mh = hashlib.sha256((root / 'release-manifest.json').read_bytes()).hexdigest()
    m = verify(root, sha, mh)
    need(m['scope'] == scope, 'ARTIFACT_SCOPE_MISMATCH')
    result = {'sourceSha': sha, 'scope': scope, 'runId': int(run_id), 'runUrl': run['html_url'],
              'manifestSha256': mh, 'artifactDigest': a['digest'], 'approvalRequired': sha + ':' + mh,
              'archiveBytes': m['archiveBytes'], 'imageBytes': max(m['imageBytes'], m['unpackedBytes']),
              'deploymentPerformed': False}
    private_json(root.parent / (root.name + '-review.json'), result)
    return result


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repository', required=True)
    p.add_argument('--scope', choices=['qavio', 'restaurant'], required=True)
    p.add_argument('--run-id', required=True)
    p.add_argument('--sha', required=True)
    p.add_argument('--output', required=True)
    a = p.parse_args()
    try:
        print(json.dumps(review(a.repository, a.scope, a.run_id, a.sha, a.output), indent=2))
    except Exception as exc:
        print('REVIEW_BLOCKED: ' + (str(exc) if isinstance(exc, ValueError) else type(exc).__name__))
        raise SystemExit(1)
