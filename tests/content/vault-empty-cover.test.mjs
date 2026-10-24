import assert from "node:assert/strict";
import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import { compileVault, noteText } from "../../tools/vault/core.mjs";

test("empty Obsidian article covers produce a string accepted by the post schema", (t) => {
	const directory = mkdtempSync(join(tmpdir(), "vault-empty-cover-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	const sourceRoot = join(directory, "vault");
	const root = join(directory, "theme");
	mkdirSync(sourceRoot);
	mkdirSync(root);
	const cases = [
		{ cover: null },
		{ cover: "" },
		{},
		{ image: null, cover: null },
		{ image: null, cover: "https://example.com/cover.png" },
		{ image: "https://example.com/image.png", cover: null },
	];
	const originals = cases.map((fields, index) => {
		const text = noteText(
			{ type: "article", publish: true, slug: `post-${index}`, ...fields },
			"Public body",
		);
		writeFileSync(join(sourceRoot, `post-${index}.md`), text);
		return text;
	});
	compileVault({ sourceRoot, root, production: true });
	for (const [index, fields] of cases.entries()) {
		const text = readFileSync(
			join(root, "src/content/posts", `post-${index}.md`),
			"utf8",
		);
		const data = parse(text.match(/^---\n([\s\S]*?)\n---/)[1]);
		assert.equal(data.image, fields.image ?? fields.cover ?? "");
		assert.equal(typeof data.image, "string");
		assert.equal(
			readFileSync(join(sourceRoot, `post-${index}.md`), "utf8"),
			originals[index],
		);
	}
});
