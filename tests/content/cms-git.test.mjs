import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	mkdtempSync,
	mkdirSync,
	writeFileSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rebaseWithClock } from "../../tools/cms/git-sync.mjs";
import { refreshState } from "../../tools/cms/core.mjs";

for (const authoredConflict of [false, true]) {
	test(`Obsidian rebase ${authoredConflict ? "preserves authored conflicts" : "regenerates only the derived clock"}`, async (t) => {
		const dir = mkdtempSync(join(tmpdir(), "cms-git-"));
		t.after(() => rmSync(dir, { recursive: true, force: true }));
		const git = (repo, args) =>
			execFileSync(
				"git",
				[
					"-c",
					"user.name=CMS test",
					"-c",
					"user.email=test@example.invalid",
					"-C",
					repo,
					...args,
				],
				{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
			).trim();
		const remote = join(dir, "remote"),
			local = join(dir, "local"),
			clock = join(dir, "clock");
		mkdirSync(remote);
		git(remote, ["init", "--bare", "--initial-branch=main"]);
		git(dir, ["clone", remote, local]);
		mkdirSync(join(local, "cms"));
		refreshState(local, "2026-10-24T00:00:00Z");
		writeFileSync(join(local, "note.md"), "Original");
		git(local, ["add", "."]);
		git(local, ["commit", "-m", "Initial"]);
		git(local, ["push", "origin", "main"]);
		git(dir, ["clone", remote, clock]);
		refreshState(clock, "2026-10-24T00:01:00Z");
		if (authoredConflict) writeFileSync(join(clock, "note.md"), "Remote edit");
		git(clock, ["add", "."]);
		git(clock, ["commit", "-m", "Server clock"]);
		git(clock, ["push", "origin", "main"]);
		refreshState(local, "2026-10-24T00:02:00Z");
		writeFileSync(join(local, "note.md"), "Local edit");
		git(local, ["add", "."]);
		git(local, ["commit", "-m", "Author edit"]);
		const saved = git(local, ["rev-parse", "HEAD"]);
		git(local, ["fetch", "origin", "main"]);
		const run = async (args) => git(local, args);
		if (authoredConflict) {
			await assert.rejects(rebaseWithClock(run, local));
			git(local, ["rebase", "--abort"]);
			assert.equal(git(local, ["rev-parse", "HEAD"]), saved);
			assert.equal(git(local, ["show", "origin/main:note.md"]), "Remote edit");
		} else {
			await rebaseWithClock(run, local);
			git(local, ["push", "origin", "main"]);
			assert.equal(git(local, ["status", "--porcelain"]), "");
			assert.doesNotThrow(() =>
				JSON.parse(
					readFileSync(join(local, "cms/publication-state.json"), "utf8"),
				),
			);
		}
		assert.equal(readFileSync(join(local, "note.md"), "utf8"), "Local edit");
	});
}
