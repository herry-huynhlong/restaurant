import copy
import io
import json
from pathlib import Path
import tempfile
import tarfile
import unittest
from unittest.mock import patch
import release_guard as g


def image(i, *tags):
    return {'Id': i, 'RepoTags': list(tags), 'Size': 1234}


def container(i, ref, running=True):
    return {'Image': i, 'Config': {'Image': ref}, 'State': {'Running': running}}


class ReleaseSafety(unittest.TestCase):
    def setUp(self):
        self.imgs = [image('active-q', 'qavio-web:current'), image('active-r', 'quanpilot-app:current'),
                     image('rb-q', 'qavio-web:rollback'), image('rb-r', 'quanpilot-app:rollback'),
                     image('old-q', 'qavio-web:old'), image('old-r', 'quanpilot-app:old'),
                     image('other', 'portfolio:old'), image('pg', 'postgres:old'),
                     image('mixed', 'qavio-web:mixed', 'portfolio:shared'), image('untagged')]
        self.cs = [container('active-q', 'qavio-web:current'), container('active-r', 'quanpilot-app:current')]
        self.rb = {repo: {'ref': repo + ':rollback', 'id': i, 'verified': True}
                   for repo, i in [('qavio-web', 'rb-q'), ('quanpilot-app', 'rb-r')]}

    def test_cleanup_only_owned_unused_nonrollback(self):
        p = g.cleanup_plan(self.imgs, self.cs, self.rb)
        self.assertEqual([x['id'] for x in p['candidates']], ['old-q', 'old-r'])
        self.assertEqual(p['mode'], 'dry-run')

    def test_stopped_container_protects_image(self):
        self.cs.append(container('old-q', 'qavio-web:old', False))
        self.assertEqual([x['id'] for x in g.cleanup_plan(self.imgs, self.cs, self.rb)['candidates']], ['old-r'])

    def test_missing_or_retagged_rollback_blocks(self):
        for mutate in [lambda r: r.clear(), lambda r: r['qavio-web'].update(id='bad'),
                       lambda r: r['qavio-web'].update(verified=False)]:
            rb = copy.deepcopy(self.rb)
            mutate(rb)
            with self.assertRaises(ValueError):
                g.cleanup_plan(self.imgs, self.cs, rb)

    def test_current_is_not_separate_rollback(self):
        self.rb['qavio-web'].update(ref='qavio-web:current', id='active-q')
        with self.assertRaisesRegex(ValueError, 'DIFFER'):
            g.cleanup_plan(self.imgs, self.cs, self.rb)

    def test_confirmation_bound_to_inventory(self):
        first = g.cleanup_plan(self.imgs, self.cs, self.rb)
        self.cs.append(container('old-q', 'qavio-web:old'))
        self.assertNotEqual(first['confirmation'], g.cleanup_plan(self.imgs, self.cs, self.rb)['confirmation'])

    def test_dry_run_performs_no_delete(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / 'rb.json'
            p.write_text(json.dumps(self.rb))
            with patch.object(g, 'images', return_value=self.imgs), patch.object(g, 'containers', return_value=self.cs), patch.object(g, 'run') as run:
                g.cleanup(p)
                run.assert_not_called()
                with self.assertRaisesRegex(ValueError, 'CHANGED'):
                    g.cleanup(p, 'wrong')
                run.assert_not_called()

    def test_race_new_container_blocks_delete(self):
        plan = g.cleanup_plan(self.imgs, self.cs, self.rb)
        new = self.cs + [container('old-q', 'qavio-web:old')]
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / 'rb.json'
            p.write_text(json.dumps(self.rb))
            with patch.object(g, 'images', return_value=self.imgs), patch.object(g, 'containers', side_effect=[self.cs, new]), patch.object(g, 'run') as run:
                with self.assertRaisesRegex(ValueError, 'PROTECTED'):
                    g.cleanup(p, plan['confirmation'])
                run.assert_not_called()

    def test_apply_deletes_only_exact_tags_without_force(self):
        plan = g.cleanup_plan(self.imgs, self.cs, self.rb)
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / 'rb.json'
            p.write_text(json.dumps(self.rb))
            with patch.object(g, 'images', return_value=self.imgs), patch.object(g, 'containers', return_value=self.cs), patch.object(g, 'run') as run:
                g.cleanup(p, plan['confirmation'])
                self.assertEqual([c.args[0] for c in run.call_args_list], [
                    ['docker', 'image', 'rm', 'qavio-web:old'], ['docker', 'image', 'rm', 'quanpilot-app:old']])

    def test_disk_threshold_and_headroom(self):
        self.assertEqual(g.disk_gate(25*g.GIB, 4*g.GIB, 0, g.GIB)['severity'], 'warning')
        self.assertFalse(g.disk_gate(25*g.GIB, 2*g.GIB, 0, g.GIB)['allowed'])
        self.assertFalse(g.disk_gate(25*g.GIB, 5*g.GIB, 3*g.GIB, g.GIB)['allowed'])
        self.assertTrue(g.disk_gate(25*g.GIB, 6*g.GIB, 3*g.GIB, g.GIB)['allowed'])
        self.assertFalse(g.disk_gate(25*g.GIB, 6*g.GIB, 0, 128*1024**2)['allowed'])

    def model(self):
        return {'name': 'qavio', 'volumes': {'data': {'name': 'unchanged'}}, 'networks': {'default': {'name': 'same'}},
                'services': {'web': {'build': {'context': '.'}, 'image': 'old', 'environment': {'SECRET': 'fixture'},
                'volumes': [{'source': 'data', 'target': '/data'}], 'healthcheck': {'test': ['CMD', 'health']}}}}

    def final(self, before):
        after = copy.deepcopy(before)
        s = after['services']['web']
        del s['build']
        s.update(image='new', pull_policy='never', logging={'driver': 'json-file', 'options': {'max-size': '10m', 'max-file': '3'}})
        return after

    def test_runtime_and_data_preserved(self):
        before = self.model()
        g.runtime_equal(before, self.final(before), 'web')
        for key, value in [('environment', {}), ('healthcheck', {}), ('volumes', []), ('mem_limit', '64m'), ('ports', [])]:
            after = self.final(before)
            after['services']['web'][key] = value
            with self.assertRaises(ValueError):
                g.runtime_equal(before, after, 'web')

    def test_build_pull_new_service_or_network_blocked(self):
        before = self.model()
        for mutate in [lambda a: a['services']['web'].update(build={'context': '.'}),
                       lambda a: a['services']['web'].update(pull_policy='missing'),
                       lambda a: a['services'].update(other={}), lambda a: a.update(networks={})]:
            after = self.final(before)
            mutate(after)
            with self.assertRaises(ValueError):
                g.runtime_equal(before, after, 'web')

    def test_atomic_private_snapshot_no_overwrite(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / 'config.json'
            g.private_json(p, {'test': True})
            with self.assertRaises(ValueError):
                g.private_json(p, {'test': False})

    def artifact(self, root):
        sha = 'a' * 40
        ref = 'qavio-web:' + sha[:7]
        cfg = {'os': 'linux', 'architecture': 'amd64', 'rootfs': {'type': 'layers', 'diff_ids': ['layer']},
               'config': {'Labels': {'org.opencontainers.image.revision': sha}}}
        archive = root / 'qavio-images.tar.gz'
        with tarfile.open(archive, 'w:gz') as t:
            for n, b in [('manifest.json', json.dumps([{'Config': 'config.json', 'RepoTags': [ref]}]).encode()),
                         ('config.json', json.dumps(cfg).encode())]:
                info = tarfile.TarInfo(n)
                info.size = len(b)
                t.addfile(info, io.BytesIO(b))
        (root / 'images.json').write_text(json.dumps([{'revision': sha, 'size': 2000}]))
        return sha

    def test_artifact_manifest_checksum_source(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            sha = self.artifact(root)
            result = g.package(root, 'qavio', sha)
            m = g.verify(root, sha, result['manifestSha256'])
            self.assertGreater(m['unpackedBytes'], 0)
            for s, h in [('b'*40, result['manifestSha256']), (sha, 'c'*64)]:
                with self.assertRaises(ValueError):
                    g.verify(root, s, h)
            with (root / 'qavio-images.tar.gz').open('ab') as f:
                f.write(b'corrupt')
            with self.assertRaisesRegex(ValueError, 'ARCHIVE'):
                g.verify(root, sha, result['manifestSha256'])

    def test_no_secret_in_release(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            sha = self.artifact(root)
            (root / '.env').write_text('FAKE_SECRET=not-real')
            with self.assertRaisesRegex(ValueError, 'UNEXPECTED_RELEASE'):
                g.package(root, 'qavio', sha)


if __name__ == '__main__':
    unittest.main()
