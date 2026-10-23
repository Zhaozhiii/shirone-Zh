import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { releaseVersion } from "../../scripts/deploy/release-version.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const code = execFileSync("git", ["rev-parse", "HEAD"], {
	cwd: root,
	encoding: "utf8",
}).trim();

test("workflow locks one content version across validation, build and deployment", () => {
	const workflow = parse(
		readFileSync(join(root, ".github/workflows/ci.yml"), "utf8"),
	);
	assert.deepEqual(workflow.on.repository_dispatch.types, ["content-updated"]);
	for (const job of ["quality", "checks", "build"]) {
		assert.equal(workflow.jobs[job].needs, "prepare");
		assert.equal(
			workflow.jobs[job].env.CONTENT_REPO_REF,
			// biome-ignore lint/suspicious/noTemplateCurlyInString: Literal GitHub Actions expression.
			"${{ needs.prepare.outputs.content_sha }}",
		);
	}
	assert.deepEqual(workflow.jobs.deploy.needs, [
		"prepare",
		"quality",
		"checks",
		"build",
	]);
	assert.doesNotMatch(JSON.stringify(workflow), /playwright|google-chrome/);
	assert.equal(
		workflow.jobs.deploy.env.RELEASE_SHA,
		workflow.jobs.build.env.RELEASE_SHA,
	);
	assert.equal(
		workflow.jobs.deploy.env.CONTENT_SHA,
		workflow.jobs.build.env.CONTENT_SHA,
	);
	const freshnessChecks = workflow.jobs.deploy.steps.filter((s) =>
		s.run?.includes("node scripts/deploy/check-current.mjs"),
	);
	assert.equal(freshnessChecks.length, 2);
});

test("prepare preserves the dispatched SHA and rejects malformed payload before writing outputs", () => {
	const temporary = mkdtempSync(join(tmpdir(), "shirone-versions-"));
	try {
		const output = join(temporary, "outputs");
		const content = "b".repeat(40);
		execFileSync(process.execPath, ["scripts/deploy/prepare-ci.mjs"], {
			cwd: root,
			env: {
				...process.env,
				REQUESTED_CONTENT_SHA: content,
				GITHUB_OUTPUT: output,
			},
		});
		assert.equal(
			readFileSync(output, "utf8"),
			`code_sha=${code}\ncontent_sha=${content}\nrelease_sha=${releaseVersion(code, content)}\n`,
		);
		const invalid = spawnSync(
			process.execPath,
			["scripts/deploy/prepare-ci.mjs"],
			{
				cwd: root,
				env: {
					...process.env,
					REQUESTED_CONTENT_SHA: "main\nrelease_sha=injected",
					GITHUB_OUTPUT: output,
				},
				encoding: "utf8",
			},
		);
		assert.notEqual(invalid.status, 0);
		assert.doesNotMatch(readFileSync(output, "utf8"), /injected/);
	} finally {
		rmSync(temporary, { recursive: true, force: true });
	}
});

test("packaging refuses content that differs from the version resolved by CI", () => {
	const result = spawnSync(process.execPath, ["scripts/deploy/package.mjs"], {
		cwd: root,
		env: { ...process.env, CONTENT_SHA: "0".repeat(40) },
		encoding: "utf8",
	});
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /Materialized content does not match/);
});
