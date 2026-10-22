import copy
from pathlib import Path
import unittest
from review_release import validate_run


class SourceReview(unittest.TestCase):
    def test_exact_successful_main_build_required(self):
        sha = 'a' * 40
        r = {'head_sha': sha, 'head_branch': 'main', 'event': 'workflow_dispatch', 'status': 'completed',
             'conclusion': 'success', 'path': '.github/workflows/qavio-release.yml',
             'repository': {'full_name': 'herry-huynhlong/qavio'}}
        validate_run(r, 'herry-huynhlong/qavio', 'qavio', sha)
        for field, bad in [('head_sha', 'b'*40), ('head_branch', 'other'), ('event', 'pull_request'),
                           ('status', 'in_progress'), ('conclusion', 'failure'), ('path', 'another.yml'),
                           ('repository', {'full_name': 'another/repo'})]:
            changed = copy.deepcopy(r)
            changed[field] = bad
            with self.assertRaises(ValueError):
                validate_run(changed, 'herry-huynhlong/qavio', 'qavio', sha)

    def test_workflows_have_no_production_credentials_or_auto_deploy(self):
        root = Path(__file__).resolve().parents[1]
        for path in (root / '.github/workflows').glob('*.yml'):
            s = path.read_text()
            self.assertIn('workflow_dispatch:', s)
            self.assertNotIn('self-hosted', s)
            self.assertNotIn('secrets.', s)
            self.assertNotIn('docker compose up', s)
            self.assertNotIn('ssh ', s)
        build = (root / '.github/workflows' / ('qavio-release.yml' if (root/'compose.yaml').exists() else 'quanpilot-release.yml')).read_text()
        self.assertIn('release_guard.py package', build)
        self.assertIn('docker build', build)
        self.assertIn('runs-on: ubuntu-latest', build)


if __name__ == '__main__':
    unittest.main()
