import json
from pathlib import Path
import tempfile
import unittest

import sync_playlist as sync


def song(song_id=1, duration=200000):
    return {"id": song_id, "name": "Track", "dt": duration, "fee": 0, "ar": [{"name": "Artist"}], "al": {"picUrl": "https://example.org/cover.jpg"}}


class SnapshotTests(unittest.TestCase):
    def fetch(self, url):
        return {"code": 200, "playlist": {"trackCount": 2, "trackIds": [{"id": 1}, {"id": 2}], "tracks": [song(1), song(2)], "trackUpdateTime": 10}}

    def test_preview_is_excluded_and_unchanged_source_needs_no_audio_requests(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sync.sync(root, self.fetch, lambda url: 30.04 if url.endswith("id=1") else 200.01)
            tracks = (root / "site/data/music.ts").read_text(encoding="utf-8")
            self.assertNotIn('"netease-1"', tracks)
            self.assertIn('"netease-2"', tracks)
            state = json.loads((root / ".github/music-playlist-state.json").read_text())
            self.assertEqual(state["excluded"][0]["reason"], "trial-30s")
            before = (root / "site/data/music.ts").stat().st_mtime_ns
            def unexpected_probe(url):
                raise AssertionError("Unchanged playlist should not fetch audio")
            self.assertEqual(sync.sync(root, self.fetch, unexpected_probe), (False, False))
            self.assertEqual(before, (root / "site/data/music.ts").stat().st_mtime_ns)

    def test_partial_network_failure_preserves_both_snapshot_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sync.sync(root, self.fetch, lambda url: 200)
            paths = [root / "site/data/music.ts", root / ".github/music-playlist-state.json"]
            before = [path.read_bytes() for path in paths]
            def failed_probe(url):
                if url.endswith("id=2"):
                    raise TimeoutError("Temporary network failure")
                return 30
            with self.assertRaises(TimeoutError):
                sync.sync(root, self.fetch, failed_probe, force=True)
            self.assertEqual(before, [path.read_bytes() for path in paths])

    def test_truncated_playlist_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Incomplete playlist"):
            sync.source_playlist(lambda url: {"code": 200, "playlist": {"trackCount": 12, "trackIds": [{"id": 1}]}})

    def test_missing_details_are_fetched_for_the_full_id_list(self):
        def fetch(url):
            if "v3/song/detail" in url:
                return {"code": 200, "songs": [song(2)]}
            result = self.fetch(url)
            result["playlist"]["tracks"] = [song(1)]
            return result
        songs, _ = sync.source_playlist(fetch)
        self.assertEqual([track["id"] for track in songs], [1, 2])

    def test_partial_audio_is_rejected_but_a_real_short_track_is_kept(self):
        self.assertEqual(sync.exclusion_reason(45, 200), "incomplete-audio")
        self.assertIsNone(sync.exclusion_reason(29.9, 30))
        self.assertIsNone(sync.exclusion_reason(199.9, 200))

    def test_cdn_hostname_changes_do_not_trigger_refresh(self):
        def other_cdn(url):
            result = self.fetch(url)
            for track in result["playlist"]["tracks"]:
                track["al"]["picUrl"] = "https://another-cdn.example.org/cover.jpg"
            return result
        self.assertEqual(sync.source_playlist(self.fetch)[1], sync.source_playlist(other_cdn)[1])


if __name__ == "__main__":
    unittest.main()
