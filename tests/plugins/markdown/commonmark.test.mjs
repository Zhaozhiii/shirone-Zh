import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { remarkObsidianSyntax } from "../../../src/plugins/markdown/core/obsidian-syntax.mjs";

// Official CommonMark 0.31.2 examples, https://spec.commonmark.org/0.31.2/spec.json
const examples = JSON.parse(readFileSync(new URL("../../fixtures/commonmark-0.31.2.json", import.meta.url), "utf8"));
const baseline = unified().use(remarkParse);
const extended = unified().use(remarkParse).use(remarkObsidianSyntax);
function semantic(tree) {
	return JSON.parse(JSON.stringify(tree, (key, value) => key === "position" ? undefined : value));
}
test("Obsidian tokenizer preserves CommonMark examples outside explicitly extended delimiters", () => {
	let checked = 0;
	for (const example of examples) {
		if (/\[\[|%%|\^|~|==|\\[([\]]/.test(example.markdown)) continue;
		assert.deepEqual(semantic(extended.parse(example.markdown)), semantic(baseline.parse(example.markdown)), `CommonMark example ${example.example}: ${example.section}`);
		checked++;
	}
	assert.ok(checked > 500, `checked ${checked} baseline examples`);
});
