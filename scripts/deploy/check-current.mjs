import { execFileSync } from "node:child_process";
import { isCurrentRelease, requireSha } from "./release-version.mjs";

const latest = async (remote) => {
	if (
		remote === process.env.CONTENT_REPO_URL &&
		process.env.CONTENT_READ_TOKEN
	) {
		const response = await fetch(
			"https://api.github.com/repos/Zhaozhiii/Obsidian-Vault/git/ref/heads/main",
			{
				headers: {
					Authorization: `Bearer ${process.env.CONTENT_READ_TOKEN}`,
					Accept: "application/vnd.github+json",
				},
			},
		);
		if (!response.ok)
			throw new Error("Unable to verify private content version");
		return requireSha(
			(await response.json()).object.sha,
			"Remote content version",
		);
	}
	return requireSha(
		execFileSync("git", ["ls-remote", remote, "refs/heads/main"], {
			encoding: "utf8",
		})
			.trim()
			.split(/\s+/)[0],
		"Remote version",
	);
};
console.log(
	isCurrentRelease({
		code: requireSha(process.env.CODE_SHA, "Code version"),
		content: requireSha(process.env.CONTENT_SHA, "Content version"),
		latestCode: await latest("origin"),
		latestContent: await latest(process.env.CONTENT_REPO_URL),
		allowRollback: process.env.ALLOW_CONTENT_ROLLBACK === "true",
	}),
);
