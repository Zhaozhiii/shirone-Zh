import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { syncUserConfig } from "../../scripts/content/config-overlay.mjs";
import { compileVault, noteText } from "../../tools/vault/core.mjs";
import { files } from "../../tools/vault/files.mjs";
import { materializeVault } from "../../tools/vault/outputs.mjs";
import { syncVault } from "../../tools/vault/sync.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
function fixture(t) {
	const base = mkdtempSync(join(tmpdir(), "vault-pipeline-"));
	t.after(() => rmSync(base, { recursive: true, force: true }));
	const root = join(base, "theme");
	const sourceRoot = join(base, "notes");
	mkdirSync(root);
	mkdirSync(sourceRoot);
	const write = (base, path, text) => {
		const target = join(base, path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, text);
		return target;
	};
	const note = (path, data, body = "") =>
		write(sourceRoot, path, noteText(data, body));
	const plan = () =>
		compileVault({
			root,
			sourceRoot,
			dryRun: true,
			previewAt: "2026-10-24T00:00:00Z",
		});
	const build = () => materializeVault({ root, sourceRoot, ...plan() });
	return { root, sourceRoot, write, note, plan, build };
}

test("unchanged inputs preserve generated files and attachments; equal-sized edits still update", (t) => {
	const { root, sourceRoot, write, note, build } = fixture(t);
	write(sourceRoot, "附件/a.png", "AAAA");
	note(
		"post.md",
		{ type: "article", publish: true, slug: "post", date: "2026-01-01" },
		"![[a.png]]\nFirst",
	);
	assert.equal(build().changed, true);
	const tracked = [
		...files(join(root, "src/content")),
		...files(join(root, "src/data")),
		...files(join(root, "public/images/vault")),
		join(root, "src/user/vault-data.json"),
	];
	const old = new Date("2020-01-01T00:00:00Z");
	for (const path of tracked) utimesSync(path, old, old);
	assert.equal(build().changed, false);
	for (const path of tracked)
		assert.equal(statSync(path).mtimeMs, old.getTime(), path);
	const asset = files(join(root, "public/images/vault"))[0];
	const source = join(sourceRoot, "附件/a.png");
	const sourceTime = statSync(source).mtime;
	writeFileSync(source, "BBBB");
	utimesSync(source, sourceTime, sourceTime);
	assert.equal(build().changed, true);
	assert.equal(existsSync(asset), false);
	assert.equal(
		readFileSync(files(join(root, "public/images/vault"))[0], "utf8"),
		"BBBB",
	);
});

test("dry-run validates the generated announcement overlay without changing existing build inputs", (t) => {
	const { sourceRoot, note } = fixture(t);
	note(
		"notice.md",
		{
			type: "announcement",
			publish: true,
			title: "Notice",
			home: true,
			link: { url: "https://example.com", enable: "invalid" },
		},
		"Content",
	);
	const target = join(repository, "src/user/user-config.ts");
	const before = readFileSync(target, "utf8");
	assert.throws(
		() => syncVault({ root: repository, sourceRoot, dryRun: true }),
		/configuration failed type checking/,
	);
	assert.equal(readFileSync(target, "utf8"), before);
});

test("a failed non-dry configuration check restores the last working generated module", () => {
	const target = join(repository, "src/user/user-config.ts");
	const before = readFileSync(target, "utf8");
	assert.throws(
		() =>
			syncUserConfig({
				root: repository,
				sourceRoot: repository,
				configFiles: new Map([
					["announcement.yaml", "board:\n  enable: invalid\n"],
				]),
			}),
		/configuration failed type checking/,
	);
	assert.equal(readFileSync(target, "utf8"), before);
});
