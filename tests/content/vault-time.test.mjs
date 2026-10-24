import assert from "node:assert/strict";
import { test } from "node:test";
import { instant, normalizeTime } from "../../tools/vault/time.mjs";

test("dotted dates and optional leading zeroes normalize to the same UTC+08 instant", () => {
	for (const value of [
		"2026.10.20 03:13:15",
		"2026.10.20 3:13:15",
		"2026-10-20T03:13:15+08:00",
	])
		assert.equal(instant(value), "2026-10-19T19:13:15.000Z");
	assert.equal(normalizeTime("2026.1.2 3:4:5"), "2026-01-02T03:04:05+08:00");
	assert.equal(instant("2026.1.2"), "2026-01-01T16:00:00.000Z");
	assert.equal(
		normalizeTime("3:13:15", "时间", "2026-10-20"),
		"2026-10-20T03:13:15+08:00",
	);
	assert.equal(instant("2026-10-20T03:13:15Z"), "2026-10-20T03:13:15.000Z");
});

test("invalid dates and clock components never roll into another day", () => {
	for (const value of [
		"2026.2.30 3:13:15",
		"2026.13.1",
		"2026.1.0",
		"2026.1.2 24:0:0",
		"2026.1.2 3:60:0",
		"2026.1.2 3:0:60",
		"2026.1.2 3:0:0+99:00",
	])
		assert.throws(() => instant(value));
	assert.throws(() => instant("3:13:15"), /笔记日期/);
	assert.equal(instant(""), null);
});
