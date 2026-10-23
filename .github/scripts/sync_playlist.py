"""Publish a verified, full-length-only NetEase playlist without storing audio."""

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

from mutagen.mp3 import MP3

PLAYLIST_ID = "18515546272"
ROOT = Path(__file__).resolve().parents[2]
HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": "https://music.163.com/"}
TIMEOUT = 15
MAX_METADATA_BYTES = 512 * 1024


def get_json(url):
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return json.load(response)


class AudioMetadataReader(io.RawIOBase):
    """Seekable HTTP range reader: mutagen sees the full size, not a short prefix."""

    def __init__(self, url):
        super().__init__()
        self.url = url
        self.position = 0
        self.cache = {}
        self.transferred = 0
        self.length = None
        self._chunk(0)

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=io.SEEK_SET):
        origin = {io.SEEK_SET: 0, io.SEEK_CUR: self.position, io.SEEK_END: self.length}[whence]
        self.position = max(0, origin + offset)
        return self.position

    def _chunk(self, start):
        if start in self.cache:
            return self.cache[start]
        if self.transferred >= MAX_METADATA_BYTES:
            raise ValueError("Audio metadata exceeds the bounded probe budget")
        request = urllib.request.Request(
            self.url,
            headers={**HEADERS, "Range": f"bytes={start}-{start + 65535}"},
        )
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            # Keep the redirected, expiring CDN address in memory only.
            self.url = response.geturl()
            content_range = response.headers.get("Content-Range", "")
            match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", content_range)
            if response.status == 206 and match and int(match[1]) == start:
                self.length = int(match[3])
            elif response.status == 200 and start == 0:
                self.length = int(response.headers["Content-Length"])
            else:
                raise ValueError("Audio server did not honor the metadata range request")
            data = response.read(65536)
        if not data:
            raise ValueError("Empty audio metadata response")
        self.transferred += len(data)
        self.cache[start] = data
        return data

    def read(self, size=-1):
        remaining = max(0, self.length - self.position)
        size = remaining if size < 0 else min(size, remaining)
        if size > MAX_METADATA_BYTES:
            raise ValueError("Refusing to download a complete audio file")
        parts = []
        while size:
            start = self.position // 65536 * 65536
            offset = self.position - start
            part = self._chunk(start)[offset:offset + size]
            if not part:
                break
            parts.append(part)
            self.position += len(part)
            size -= len(part)
        return b"".join(parts)


def audio_duration(url):
    with AudioMetadataReader(url) as reader:
        return MP3(reader).info.length


def source_playlist(fetch=get_json):
    data = fetch(f"https://music.163.com/api/v6/playlist/detail?id={PLAYLIST_ID}&n=100000&s=0")
    playlist = data.get("playlist", {})
    ids = [str(item["id"]) for item in playlist.get("trackIds", [])]
    if data.get("code") != 200 or not ids or len(ids) != playlist.get("trackCount"):
        raise ValueError("Incomplete playlist response; previous snapshot is preserved")
    songs = {str(item["id"]): item for item in playlist.get("tracks", [])}
    missing = [song_id for song_id in ids if song_id not in songs]
    for offset in range(0, len(missing), 100):
        batch = missing[offset:offset + 100]
        encoded = urllib.parse.quote(json.dumps([{"id": int(song_id)} for song_id in batch]))
        details = fetch(f"https://music.163.com/api/v3/song/detail?c={encoded}")
        if details.get("code") != 200:
            raise ValueError("Song details unavailable; previous snapshot is preserved")
        songs.update({str(item["id"]): item for item in details.get("songs", [])})
    if any(song_id not in songs for song_id in ids):
        raise ValueError("Missing song details; previous snapshot is preserved")
    ordered = [songs[song_id] for song_id in ids]
    identity = {
        "updatedAt": playlist.get("trackUpdateTime"),
        # CDN shard hostnames and transient response fields are not playlist changes.
        "songs": [{
            "id": song["id"], "name": song["name"], "duration": song["dt"],
            "artists": [{key: artist.get(key) for key in ["id", "name"]} for artist in song["ar"]],
            "albumId": song["al"].get("id"),
            "pictureId": str(song["al"].get("pic_str", song["al"].get("pic", ""))),
            "fee": song.get("fee"),
        } for song in ordered],
    }
    fingerprint = hashlib.sha256(json.dumps(identity, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    return ordered, fingerprint


def exclusion_reason(actual, expected):
    if actual <= 31 and expected > 31:
        return "trial-30s"
    if actual < expected * 0.95 - 3:
        return "incomplete-audio"
    return None


def render_tracks(tracks):
    lines = [
        'import type { TrackDescriptor } from "@/types/musicConfig";',
        "",
        "// Generated by .github/scripts/sync_playlist.py; audio stays on its original host.",
        "export const musicTracks: readonly TrackDescriptor[] = [",
    ]
    for track in tracks:
        lines.append("\t{")
        for key, value in track.items():
            literal = json.dumps(value, ensure_ascii=False)
            line = f"\t\t{key}: {literal},"
            # Keep generated TypeScript compatible with the theme's Biome gate.
            if len(line.expandtabs(2)) > 80:
                lines.extend([f"\t\t{key}:", f"\t\t\t{literal},"])
            else:
                lines.append(line)
        lines.append("\t},")
    lines.extend([
        "]" + ";", "",
    ])
    return "\n".join(lines)


def sync(root=ROOT, fetch=get_json, probe=audio_duration, force=False):
    state_path = root / ".github/music-playlist-state.json"
    tracks_path = root / "site/data/music.ts"
    songs, fingerprint = source_playlist(fetch)
    previous = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
    if not force and previous.get("sourceHash") == fingerprint and tracks_path.exists():
        print("Playlist unchanged; no audio probes, commit or deployment needed.")
        return False, False
    tracks, excluded = [], []
    for song in songs:
        song_id, title = str(song["id"]), song["name"]
        source = f"https://api.injahow.cn/meting/?server=netease&type=url&id={song_id}"
        expected = song["dt"] / 1000
        try:
            actual = probe(source)
            reason = exclusion_reason(actual, expected)
        except urllib.error.HTTPError as error:
            if error.code not in (403, 404, 410):
                raise
            # These can be temporary CDN/API failures; do not erase the last good list.
            raise RuntimeError(f"Audio access unavailable for {song_id}; previous snapshot is preserved") from None
        if reason:
            excluded.append({"id": song_id, "title": title, "reason": reason, "duration": round(actual, 2)})
            print(f"Excluded {song_id}: {reason} ({actual:.2f}s / {expected:.2f}s)")
            continue
        tracks.append({
            "id": f"netease-{song_id}",
            "title": title,
            "artist": " / ".join(artist["name"] for artist in song["ar"]),
            "source": source,
            "cover": re.sub(r"^https?://[^/]+\.music\.126\.net/", "https://p2.music.126.net/", song["al"]["picUrl"]),
            "duration": round(actual),
            "lrc": f"https://api.injahow.cn/meting/?server=netease&type=lrc&id={song_id}",
        })
    # All requests and validation finish before either snapshot is changed.
    output = render_tracks(tracks)
    site_changed = not tracks_path.exists() or tracks_path.read_text(encoding="utf-8") != output
    state = json.dumps({
        "schemaVersion": 1,
        "playlistId": PLAYLIST_ID,
        "sourceHash": fingerprint,
        "sourceCount": len(songs),
        "playableCount": len(tracks),
        "excluded": excluded,
    }, ensure_ascii=False, indent=2) + "\n"
    state_changed = not state_path.exists() or state_path.read_text(encoding="utf-8") != state
    for target, text, changed in [(tracks_path, output, site_changed), (state_path, state, state_changed)]:
        if not changed:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + ".tmp")
        temporary.write_text(text, encoding="utf-8", newline="\n")
        os.replace(temporary, target)
    print(f"Playlist snapshot: {len(songs)} songs, {len(tracks)} full-length, {len(excluded)} excluded.")
    return state_changed or site_changed, site_changed


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Recheck audio even if the playlist is unchanged")
    args = parser.parse_args()
    changed, site_changed = sync(force=args.force)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write(f"changed={str(changed).lower()}\nsite_changed={str(site_changed).lower()}\n")
