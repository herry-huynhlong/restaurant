"""Real Docker Compose config parser; does NOT require/start Docker Engine."""
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import release_guard as g


class ComposeMerge(unittest.TestCase):
    def test_production_overlay_preserves_model_and_removes_build(self):
        root = Path(__file__).resolve().parents[1]
        scope = 'qavio' if (root / 'compose.yaml').exists() else 'restaurant'
        bases = ['compose.yaml', 'compose.production.yaml', 'compose.release-candidate.yaml'] if scope == 'qavio' else ['docker-compose.yml']
        with tempfile.TemporaryDirectory() as td:
            temp = Path(td)
            for name in bases + ['compose.image-only.yaml']:
                shutil.copyfile(root / name, temp / name)
            for name in ['.env.production', '.env.database', '.env.migration']:
                (temp / name).write_text('DATABASE_URL=postgresql://fixture:fixture@postgres/test\n')
            env = {**os.environ, 'RELEASE_IMAGE': 'fixture:approved', 'RELEASE_WORKER_IMAGE': 'fixture:worker',
                   'RELEASE_POSTGRES_IMAGE': 'postgres:16-alpine', 'POSTGRES_PASSWORD': 'fixture-not-production',
                   'NEXTAUTH_URL': 'https://admin.qavio.site', 'NEXTAUTH_SECRET': 'fixture-only',
                   'NEXT_PUBLIC_VAPID_PUBLIC_KEY': '', 'VAPID_PRIVATE_KEY': '', 'VAPID_SUBJECT': ''}
            cmd = ['docker', 'compose', '--project-directory', td, '-p', scope]
            for name in bases:
                cmd += ['-f', str(temp / name)]
            def resolve(c):
                p = subprocess.run(c + ['--profile', '*', 'config', '--format', 'json'], env=env, text=True, capture_output=True)
                self.assertEqual(p.returncode, 0, p.stderr)
                return json.loads(p.stdout)
            before = resolve(cmd)
            after = resolve(cmd + ['-f', str(temp / 'compose.image-only.yaml')])
            g.runtime_equal(before, after, g.SCOPES[scope][0])
            self.assertTrue(any(s.get('build') for s in before['services'].values()))
            self.assertFalse(any(s.get('build') for s in after['services'].values()))
            self.assertTrue(all(s['pull_policy'] == 'never' for s in after['services'].values()))
            # Development/CI base files stay buildable.
            self.assertIn('build', before['services'][g.SCOPES[scope][0]])


if __name__ == '__main__':
    unittest.main()
