import { execFileSync } from "node:child_process";
import { isCurrentRelease, requireSha } from "./release-version.mjs";

const latest = (remote) =>
	requireSha(
		execFileSync("git", ["ls-remote", remote, "refs/heads/main"], {
			encoding: "utf8",
		})
			.trim()
			.split(/\s+/)[0],
		"Remote version",
	);
console.log(
	isCurrentRelease({
		code: requireSha(process.env.CODE_SHA, "Code version"),
		content: requireSha(process.env.CONTENT_SHA, "Content version"),
		latestCode: latest("origin"),
		latestContent: latest(process.env.CONTENT_REPO_URL),
		allowRollback: process.env.ALLOW_CONTENT_ROLLBACK === "true",
	}),
);
