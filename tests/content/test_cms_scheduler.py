import importlib.util
import pathlib
import hashlib
import json
import unittest
import tempfile
import subprocess

path = pathlib.Path(__file__).resolve().parents[2] / 'tools/cms/scheduler.py'
spec = importlib.util.spec_from_file_location('cms_scheduler', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SchedulerTests(unittest.TestCase):
    def repositories(self):
        directory = tempfile.TemporaryDirectory(prefix='cms-scheduler-')
        self.addCleanup(directory.cleanup)
        base = pathlib.Path(directory.name)
        remote, a, b = (base / name for name in ['remote.git', 'a', 'b'])
        subprocess.run(['git', 'init', '--bare', '--initial-branch=main', str(remote)], check=True, capture_output=True)
        subprocess.run(['git', 'clone', str(remote), str(a)], check=True, capture_output=True)
        (a / 'cms').mkdir()
        (a / module.STATE).write_text(json.dumps(self.state()), encoding='utf-8')
        module.git(a, 'add', '.')
        module.git(a, 'commit', '-m', 'test: schedule')
        module.git(a, 'push', 'origin', 'HEAD:main')
        subprocess.run(['git', 'clone', str(remote), str(b)], check=True, capture_output=True)
        return remote, a, b

    def state(self):
        transitions = ['2026-10-24T00:10:00.000Z', '2026-10-24T00:20:00.000Z']
        return dict(schemaVersion=1, evaluatedAt='2026-10-24T00:00:00.000Z',
                    transitions=transitions,
                    scheduleHash=hashlib.sha256(json.dumps(transitions, separators=(',', ':')).encode()).hexdigest())

    def test_idle_does_not_commit(self):
        self.assertIsNone(module.advance(self.state(), '2026-10-24T00:05:00.000Z'))

    def test_due_and_repeated_tick(self):
        updated = module.advance(self.state(), '2026-10-24T00:10:00.000Z')
        self.assertIsNotNone(updated)
        self.assertIsNone(module.advance(updated, '2026-10-24T00:10:00.000Z'))

    def test_restart_catches_up_all_missed_transitions(self):
        updated = module.advance(self.state(), '2026-10-24T01:00:00.000Z')
        self.assertEqual(updated['evaluatedAt'], '2026-10-24T01:00:00.000Z')

    def test_invalid_index_is_rejected(self):
        state = self.state()
        state['transitions'].append('2027-01-01T00:00:00.000Z')
        with self.assertRaises(ValueError):
            module.advance(state, '2026-10-24T01:00:00.000Z')

    def test_failed_push_is_retried_without_an_extra_commit(self):
        remote, a, b = self.repositories()
        module.tick(a, '2026-10-24T00:10:00.000Z', network=False)
        head = module.git(a, 'rev-parse', 'HEAD')
        self.assertFalse(module.tick(a, '2026-10-24T00:10:00.000Z'))
        self.assertEqual(module.git(a, 'rev-parse', 'origin/main'), head)

    def test_concurrent_clock_and_user_changes_preserve_remote_content(self):
        remote, a, b = self.repositories()
        module.tick(a, '2026-10-24T00:10:00.000Z', network=False)
        state = self.state()
        state['evaluatedAt'] = '2026-10-24T00:15:00.000Z'
        (b / module.STATE).write_text(json.dumps(state), encoding='utf-8')
        (b / 'user-note.md').write_text('Preserve this user content', encoding='utf-8')
        module.git(b, 'add', '.')
        module.git(b, 'commit', '-m', 'test: concurrent user update')
        module.git(b, 'push', 'origin', 'HEAD:main')
        self.assertTrue(module.tick(a, '2026-10-24T00:20:00.000Z'))
        self.assertEqual((a / 'user-note.md').read_text(encoding='utf-8'), 'Preserve this user content')
        self.assertEqual(json.loads((a / module.STATE).read_text())['evaluatedAt'], '2026-10-24T00:20:00.000Z')
        self.assertEqual(module.git(a, 'status', '--porcelain'), '')


if __name__ == '__main__':
    unittest.main()
