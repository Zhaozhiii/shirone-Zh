import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { releaseVersion, requireSha } from "./release-version.mjs";

const code = requireSha(
	execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
	"Code version",
);
const requested = process.env.REQUESTED_CONTENT_SHA;
const content = requireSha(
	requested ||
		execFileSync(
			"git",
			["ls-remote", process.env.CONTENT_REPO_URL, "refs/heads/main"],
			{ encoding: "utf8" },
		)
			.trim()
			.split(/\s+/)[0],
	"Content version",
);
const release = releaseVersion(code, content);
appendFileSync(
	process.env.GITHUB_OUTPUT,
	`code_sha=${code}\ncontent_sha=${content}\nrelease_sha=${release}\n`,
);
console.log(`Resolved code ${code}, content ${content}, release ${release}`);
