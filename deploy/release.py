#!/usr/bin/env python3
"""Run as shirone-deploy; the only sudo grant is restarting its own container."""
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.request

ROOT = Path("/srv/shirone-blog/site")
SHA = re.compile(r"[a-f0-9]{40}")
HEALTH = "https://blog.zhiii.top/healthz"


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def link(name, target):
    temporary = ROOT / f".{name}.{os.getpid()}"
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(target)
    temporary.replace(ROOT / name)


def restart():
    subprocess.run(["sudo", "-n", "/usr/bin/docker", "restart", "shirone-blog"], check=True, timeout=45)


def healthy(sha):
    for _ in range(25):
        try:
            with urllib.request.urlopen(HEALTH, timeout=5) as response:
                data = json.load(response)
                if data.get("status") == "ok" and data.get("release") == sha:
                    with urllib.request.urlopen("https://blog.zhiii.top/", timeout=5) as home:
                        if home.status == 200:
                            return
        except (OSError, ValueError):
            pass
        time.sleep(2)
    raise RuntimeError(f"Health check failed for {sha}")


def unpack(sha):
    archive = ROOT / "incoming" / f"{sha}.tar.gz"
    checksum = archive.with_suffix(".gz.sha256")
    expected = checksum.read_text().split()[0]
    if not re.fullmatch(r"[a-f0-9]{64}", expected) or digest(archive) != expected:
        raise ValueError("Archive checksum mismatch")
    target = ROOT / "releases" / sha
    stage = ROOT / "releases" / f".staging-{sha}"
    if target.exists():
        # A commit identifies immutable bytes. Reruns reuse the validated release.
        if json.loads((target / "release.json").read_text())["release"] != sha:
            raise ValueError("Existing release metadata mismatch")
        return target
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir()
    try:
        with tarfile.open(archive, "r:gz") as package:
            for member in package.getmembers():
                path = PurePosixPath(member.name)
                if path.is_absolute() or ".." in path.parts or not (member.isfile() or member.isdir()):
                    raise ValueError("Unsafe archive entry")
                if path.parts and path.parts[0] not in {"dist", "server.cjs", "release.json", "SHA256SUMS"}:
                    raise ValueError(f"Unexpected archive entry: {member.name}")
            package.extractall(stage, filter="data")
        listed = set()
        for line in (stage / "SHA256SUMS").read_text().splitlines():
            expected_hash, filename = line.split("  ", 1)
            path = PurePosixPath(filename)
            if path.is_absolute() or ".." in path.parts or filename in listed:
                raise ValueError("Unsafe checksum path")
            if digest(stage / filename) != expected_hash:
                raise ValueError(f"File checksum mismatch: {filename}")
            listed.add(filename)
        actual = {str(path.relative_to(stage).as_posix()) for path in stage.rglob("*") if path.is_file()}
        if actual != listed | {"SHA256SUMS"}:
            raise ValueError("Release manifest is incomplete")
        if json.loads((stage / "release.json").read_text())["release"] != sha:
            raise ValueError("Release SHA mismatch")
        if not (stage / "dist/index.html").is_file() or not (stage / "server.cjs").is_file():
            raise ValueError("Missing site or runtime")
        stage.rename(target)
    except BaseException:
        shutil.rmtree(stage, ignore_errors=True)
        raise
    return target


def activate(sha):
    current = ROOT / "current"
    old = os.readlink(current) if current.is_symlink() else None
    link("current", f"releases/{sha}")
    try:
        restart()
        healthy(sha)
    except BaseException:
        if old:
            link("current", old)
            restart()
            healthy(Path(old).name)
            print(f"Restored previous release {Path(old).name}", flush=True)
        else:
            current.unlink(missing_ok=True)
        raise
    if old and old != f"releases/{sha}":
        link("previous", old)
    print(f"Active release: {sha}", flush=True)
    protected = {sha}
    previous = ROOT / "previous"
    if previous.is_symlink():
        protected.add(Path(os.readlink(previous)).name)
    releases = sorted((p for p in (ROOT / "releases").iterdir() if SHA.fullmatch(p.name)), key=lambda p: p.stat().st_mtime, reverse=True)
    keep = set(protected)
    for path in releases:
        if len(keep) >= 3:
            break
        keep.add(path.name)
    for path in releases:
        if path.name not in keep:
            shutil.rmtree(path)
    for path in (ROOT / "incoming").glob("*"):
        if path.is_file():
            path.unlink()


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command not in {"activate", "rollback"}:
        raise ValueError("Usage: shirone-blog-release activate <sha> | rollback [sha]")
    with (ROOT / ".release.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        sha = sys.argv[2] if len(sys.argv) > 2 else Path(os.readlink(ROOT / "previous")).name
        if not SHA.fullmatch(sha):
            raise ValueError("Expected a full Git SHA")
        if command == "activate":
            unpack(sha)
        elif not (ROOT / "releases" / sha / "release.json").is_file():
            raise ValueError("Rollback release is unavailable")
        activate(sha)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Deployment failed: {error}", file=sys.stderr, flush=True)
        sys.exit(1)
