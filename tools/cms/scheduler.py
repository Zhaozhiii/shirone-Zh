"""Headless publication clock. No credentials or article text are logged."""
import argparse
import datetime as dt
import hashlib
import json
import pathlib
import subprocess
import sys

STATE = "cms/publication-state.json"


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], check=True,
                          text=True, capture_output=True).stdout.strip()


def advance(state, now):
    transitions = state["transitions"]
    expected = hashlib.sha256(json.dumps(transitions, separators=(",", ":")).encode()).hexdigest()
    if state.get("schemaVersion") != 1 or expected != state.get("scheduleHash"):
        raise ValueError("Invalid schedule index; publication stopped")
    if not any(state["evaluatedAt"] < t <= now for t in transitions):
        return None
    return {**state, "evaluatedAt": now}


def tick(repo, now, network=True, retries=3):
    if git(repo, "status", "--porcelain"):
        raise RuntimeError("Scheduler checkout is not clean")
    if network:
        git(repo, "fetch", "origin", "main")
        if git(repo, "rev-list", "--count", "origin/main..HEAD") != "0":
            try:
                git(repo, "rebase", "origin/main")
            except subprocess.CalledProcessError:
                git(repo, "rebase", "--abort")
                changed = git(repo, "diff", "--name-only", "origin/main...HEAD").splitlines()
                if any(p != STATE for p in changed):
                    raise RuntimeError("Unexpected local changes in scheduler checkout")
                git(repo, "reset", "--hard", "origin/main")
        else:
            git(repo, "merge", "--ff-only", "origin/main")
    path = pathlib.Path(repo) / STATE
    state = json.loads(path.read_text(encoding="utf-8"))
    updated = advance(state, now)
    if updated is None:
        # A failed push is retried without creating a second clock commit.
        if network and git(repo, "rev-list", "--count", "origin/main..HEAD") != "0":
            git(repo, "push", "origin", "HEAD:main")
        return False
    path.write_text(json.dumps(updated, indent=2) + "\n", encoding="utf-8")
    git(repo, "add", "--", STATE)
    git(repo, "-c", "user.name=Shirone CMS scheduler", "-c",
        "user.email=cms-scheduler@users.noreply.github.com", "commit", "-m",
        "chore(cms): advance publication clock")
    if network:
        try:
            git(repo, "push", "origin", "HEAD:main")
        except subprocess.CalledProcessError:
            # Preserve both commits; reconcile only the generated clock file next tick.
            git(repo, "fetch", "origin", "main")
            try:
                git(repo, "rebase", "origin/main")
            except subprocess.CalledProcessError:
                git(repo, "rebase", "--abort")
                # This is a dedicated automation checkout: only its own clock commit
                # is discarded. The remote branch and user files are never rewritten.
                git(repo, "reset", "--hard", "origin/main")
                if retries <= 0:
                    raise RuntimeError("Concurrent updates; retry on next timer tick")
                return tick(repo, now, network=True, retries=retries-1)
            git(repo, "push", "origin", "HEAD:main")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    args = parser.parse_args()
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    try:
        print("Publication clock advanced" if tick(args.repo, now) else "No publication transitions due")
    except Exception as error:
        # No captured Git output: it may contain private repository paths or data.
        print("Publication scheduler failed: " + type(error).__name__, file=sys.stderr)
        sys.exit(1)
