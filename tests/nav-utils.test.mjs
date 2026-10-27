import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePageKey } from "../src/utils/nav-utils.ts";

test("only archive taxonomy filters change the current navigation section", () => {
	for (const [path, key] of [
		["/moments/?tag=travel", "moments"],
		["/friends/?tag=blog", "friends"],
		["/projects/?category=web", "projects"],
		["/archive/?tag=blog", "tags"],
		["/archive/?category=web", "categories"],
		["/archive/", "archive"],
		["/categories/", "categories"],
		["/tags/", "tags"],
		["/series/example/", "series"],
		["/media/example/", "media"],
		["/guestbook/", "guestbook"],
		["/sponsor/", "sponsor"],
	])
		assert.equal(
			resolvePageKey(new URL(path, "https://example.com")),
			key,
			path,
		);
});
