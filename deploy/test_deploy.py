"""Fault-injected deployment rehearsals; no Docker daemon or real data."""
import argparse
import copy
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import release_guard as g
import test_release_guard as safety_tests


class DeployRehearsal(unittest.TestCase):
    def exercise(self, failure=None, apply=False):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        sha = safety_tests.ReleaseSafety().artifact(root)
        packaged = g.package(root, 'qavio', sha)
        manifest = g.verify(root, sha, packaged['manifestSha256'])
        cfg, _, _ = g.archive_config(root / manifest['archive'])
        base = {'name': 'qavio', 'volumes': {'data': {'name': 'same'}}, 'services': {}}
        cs = []
        for svc in ['web', 'worker', 'qavio-postgres']:
            ref = 'old' if svc == 'web' else svc + ':fixed'
            base['services'][svc] = {'image': ref, 'environment': {'KEEP': 'same'}}
            cs.append({'Id': svc + '-container', 'Name': '/qavio-' + svc + '-1', 'Image': svc + '-image',
                       'State': {'Running': True, 'StartedAt': 'before', 'Health': {'Status': 'healthy'}},
                       'RestartCount': 0, 'Mounts': [{'Destination': '/data', 'Source': '/unchanged'}],
                       'Config': {'Image': ref, 'Env': ['KEEP=same'], 'Labels': {
                           'com.docker.compose.project': 'qavio', 'com.docker.compose.service': svc}},
                       'HostConfig': {'LogConfig': {'Type': 'json-file', 'Config': {}}}})
        final = copy.deepcopy(base)
        for v in final['services'].values():
            v.update(pull_policy='never', logging={'driver': 'json-file', 'options': {'max-size': '10m', 'max-file': '3'}})
        final['services']['web']['image'] = manifest['image']
        base['services']['web']['build'] = {'context': '.'}
        args = argparse.Namespace(directory=str(root), sha=sha, manifest_sha=packaged['manifestSha256'],
             project_dir=str(root), rollback_image='old', base=[str(root / 'base.yaml')],
             approve=sha + ':' + packaged['manifestSha256'] if apply else None, snapshot_dir=str(root / '.runtime/snapshot'))
        if failure == 'approval':
            args.approve = 'wrong'
        if failure == 'env':
            cs[0]['Config']['Env'] = ['KEEP=drifted']
        commands = []
        state = {'rolledBack': False, 'new': False}
        loaded = {'Id': 'new-image', 'Config': cfg['config'], 'RootFS': manifest['rootfs']}
        if failure == 'loaded':
            loaded['RootFS'] = {'Type': 'layers', 'Layers': ['wrong']}

        def fake_inspect(ref, kind='container'):
            if kind == 'image':
                if ref == manifest['image']:
                    return loaded
                if ref == 'old':
                    return {'Id': 'wrong' if failure == 'rollback' else 'web-image'}
                return {'Id': next(x['Image'] for x in cs if x['Config']['Image'] == ref)}
            return copy.deepcopy(cs[0])

        def fake_run(cmd, env=None):
            commands.append(cmd)
            if 'config' in cmd:
                return json.dumps(final if 'compose.image-only.yaml' in ' '.join(cmd) else base)
            if 'up' in cmd:
                if any('rollback-pinned' in s for s in cmd):
                    state.update(rolledBack=True, new=False)
                    cs[0]['Image'] = 'web-image'
                else:
                    state['new'] = True
                    cs[0]['Image'] = 'new-image'
                    cs[0]['Id'] = 'new-container'
                return ''
            self.assertEqual(cmd[:2], ['docker', 'load'])
            return ''

        def http(url):
            if failure == 'health' and state['new']:
                raise ValueError('HTTP_FAILED')

        mocks = [patch.object(g.sys, 'platform', 'linux'), patch.object(g, 'containers', side_effect=lambda: copy.deepcopy(cs)),
                 patch.object(g, 'inspect', side_effect=fake_inspect), patch.object(g, 'run', side_effect=fake_run),
                 patch.object(g, 'memory_available', return_value=g.GIB), patch.object(g.time, 'sleep'),
                 patch.object(g, 'request_ok', side_effect=http), patch.object(g.shutil, 'disk_usage',
                   return_value=SimpleNamespace(total=25*g.GIB, free=(1 if failure == 'disk' else 8)*g.GIB))]
        for mock in mocks:
            mock.start()
            self.addCleanup(mock.stop)
        return args, commands, state, root

    def test_plan_never_loads_or_recreates(self):
        args, cmds, _, _ = self.exercise()
        self.assertEqual(g.deploy(args)['mode'], 'dry-run')
        self.assertFalse(any('up' in c or 'load' in c for c in cmds))

    def test_preflight_and_approval_fail_closed(self):
        for failure in ['approval', 'disk', 'rollback', 'env']:
            with self.subTest(failure=failure):
                args, cmds, _, _ = self.exercise(failure, True)
                with self.assertRaises(ValueError):
                    g.deploy(args)
                self.assertFalse(any('up' in c or 'load' in c for c in cmds))

    def test_loaded_image_mismatch_does_not_recreate(self):
        args, cmds, _, _ = self.exercise('loaded', True)
        with self.assertRaisesRegex(ValueError, 'LOADED_IMAGE'):
            g.deploy(args)
        self.assertFalse(any('up' in c for c in cmds))

    def test_approved_image_only_single_service_and_private_rollback(self):
        args, cmds, state, root = self.exercise(apply=True)
        result = g.deploy(args)
        self.assertTrue(result['healthy'])
        up = [c for c in cmds if 'up' in c]
        self.assertEqual(len(up), 1)
        self.assertEqual(up[0][-7:], ['up', '-d', '--no-build', '--pull', 'never', '--no-deps', 'web'])
        self.assertEqual(json.loads((root/'.runtime/snapshot/pinned.json').read_text())['services']['web']['image'], 'new-image')
        self.assertEqual(json.loads((root/'.runtime/snapshot/rollback-pinned.json').read_text())['services']['web']['image'], 'web-image')
        self.assertFalse(state['rolledBack'])

    def test_failed_health_rolls_back_and_checks_http(self):
        args, cmds, state, _ = self.exercise('health', True)
        with self.assertRaisesRegex(ValueError, 'ROLLBACK_HTTP_VERIFIED'):
            g.deploy(args)
        self.assertTrue(state['rolledBack'])
        self.assertEqual(len([c for c in cmds if 'up' in c]), 2)


if __name__ == '__main__':
    unittest.main()
