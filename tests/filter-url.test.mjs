import assert from "node:assert/strict";
import { test } from "node:test";
import { replaceFilterQuery } from "../src/utils/filter-url.ts";

test("filter updates retain encoded anchors and Swup history state", (t) => {
	const state = { source: "swup", index: 3, scroll: { top: 650 } };
	const calls = [];
	const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
	const previousHistory = Object.getOwnPropertyDescriptor(
		globalThis,
		"history",
	);
	t.after(() => {
		for (const [name, descriptor] of [
			["window", previousWindow],
			["history", previousHistory],
		]) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		}
	});
	globalThis.window = {
		location: {
			href: "https://example.com/moments/?keep=1#moment-%E4%B8%AD%E6%96%87",
		},
	};
	globalThis.history = { state, replaceState: (...args) => calls.push(args) };
	replaceFilterQuery(new URLSearchParams({ keep: "1", q: "design" }));
	replaceFilterQuery(new URLSearchParams());
	assert.deepEqual(calls, [
		[state, "", "/moments/?keep=1&q=design#moment-%E4%B8%AD%E6%96%87"],
		[state, "", "/moments/#moment-%E4%B8%AD%E6%96%87"],
	]);
});
