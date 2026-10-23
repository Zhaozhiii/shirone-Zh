import assert from "node:assert/strict";
import { test } from "node:test";
import {
	isCurrentRelease,
	releaseVersion,
} from "../../scripts/deploy/release-version.mjs";

const code = "a".repeat(40);
const content = "b".repeat(40);
const other = "c".repeat(40);

test("content-only and code-only updates receive different immutable releases", () => {
	const release = releaseVersion(code, content);
	assert.match(release, /^[a-f0-9]{40}$/);
	assert.equal(release, releaseVersion(code, content));
	assert.notEqual(release, releaseVersion(code, other));
	assert.notEqual(release, releaseVersion(other, content));
	assert.equal(releaseVersion(code), code);
	assert.throws(() => releaseVersion("main", content));
	assert.throws(() => releaseVersion(code, "main"));
});

test("new code or content supersedes queued releases; explicit rollback only permits old content", () => {
	const current = { code, content, latestCode: code, latestContent: content };
	assert.equal(isCurrentRelease(current), true);
	assert.equal(isCurrentRelease({ ...current, latestContent: other }), false);
	assert.equal(isCurrentRelease({ ...current, latestCode: other }), false);
	assert.equal(
		isCurrentRelease({ ...current, latestContent: other, allowRollback: true }),
		true,
	);
	assert.equal(
		isCurrentRelease({ ...current, latestCode: other, allowRollback: true }),
		false,
	);
});
