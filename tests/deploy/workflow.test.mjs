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

test("public theme CI uses only fixtures; private publication pins both versions and checks freshness", () => {
	const publicWorkflow = parse(
		readFileSync(join(root, ".github/workflows/ci.yml"), "utf8"),
	);
	assert.equal(publicWorkflow.jobs.deploy, undefined);
	assert.equal(
		publicWorkflow.jobs.build.env.CONTENT_DIR,
		"artifacts/vault-fixture",
	);
	const notification = publicWorkflow.jobs.build.steps.find(
		(s) => s.name === "Notify private content publication",
	);
	assert.match(notification.if, /pull_request/);
	assert.match(notification.if, /refs\/heads\/main/);
	const workflow = parse(
		readFileSync(join(root, ".github/workflows/publish-vault.yml"), "utf8"),
	);
	assert.ok(workflow.on.workflow_call);
	assert.match(workflow.jobs.publish.if, /Zhaozhiii\/Obsidian-Vault/);
	assert.equal(
		workflow.jobs.publish.env.CONTENT_REPO_URL,
		"https://github.com/Zhaozhiii/Obsidian-Vault.git",
	);
	const content = workflow.jobs.publish.steps.find(
		(s) => s.name === "Checkout exact Vault revision",
	);
	assert.match(content.with.ref, /github\.sha/);
	const theme = workflow.jobs.publish.steps.find(
		(s) => s.name === "Checkout exact source revision",
	);
	assert.equal(theme.with.ref, "${{ steps.theme.outputs.sha }}");
	const build = workflow.jobs.publish.steps.find(
		(s) => s.name === "Build and verify release",
	);
	assert.equal(
		build.env.CONTENT_SHA,
		"${{ steps.versions.outputs.content_sha }}",
	);
	assert.equal(build.env.CODE_SHA, "${{ steps.versions.outputs.code_sha }}");
	const activation = workflow.jobs.publish.steps.find(
		(s) => s.name === "Activate only the current code and content",
	);
	assert.match(activation.run, /node scripts\/deploy\/check-current\.mjs/);
	assert.doesNotMatch(JSON.stringify(workflow), /playwright|google-chrome/);
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
		env: {
			...process.env,
			CODE_SHA: code,
			GITHUB_SHA: "a".repeat(40),
			CONTENT_SHA: "0".repeat(40),
		},
		encoding: "utf8",
	});
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /Materialized content does not match/);
});
