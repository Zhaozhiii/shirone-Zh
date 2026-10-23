import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "shirone-notify-"));
const git = (args) =>
	execFileSync(
		"git",
		[
			"-c",
			"user.name=Shirone theme publisher",
			"-c",
			"user.email=cms-theme@users.noreply.github.com",
			...args,
		],
		{
			cwd: dir,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		},
	).trim();
try {
	git([
		"clone",
		"--quiet",
		"--depth",
		"1",
		"git@github.com:Zhaozhiii/Shirone-Zh-CMS.git",
		".",
	]);
	const sha = process.env.GITHUB_SHA;
	if (!/^[a-f0-9]{40}$/.test(sha || "")) throw new Error("Invalid code SHA");
	writeFileSync(
		join(dir, "cms/theme-version.json"),
		JSON.stringify({ code: sha }) + "\n",
	);
	git(["add", "cms/theme-version.json"]);
	if (git(["diff", "--cached", "--name-only"])) {
		git([
			"-c",
			"user.name=Shirone theme publisher",
			"-c",
			"user.email=cms-theme@users.noreply.github.com",
			"commit",
			"-m",
			"chore(cms): update theme version",
		]);
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				git(["push", "origin", "HEAD:main"]);
				break;
			} catch {
				if (attempt === 2) throw new Error("Content notification push failed");
				git(["pull", "--rebase", "origin", "main"]);
			}
		}
	}
	console.log("Private publication pipeline notified");
} finally {
	rmSync(dir, { recursive: true, force: true });
}
