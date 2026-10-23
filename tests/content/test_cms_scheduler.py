import importlib.util
import pathlib
import hashlib
import json
import unittest

path = pathlib.Path(__file__).resolve().parents[2] / 'tools/cms/scheduler.py'
spec = importlib.util.spec_from_file_location('cms_scheduler', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SchedulerTests(unittest.TestCase):
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


if __name__ == '__main__':
    unittest.main()
