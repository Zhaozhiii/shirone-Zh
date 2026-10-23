import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	mkdtempSync,
	mkdirSync,
	writeFileSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshState, noteText } from "../../tools/cms/core.mjs";

test("repeating migration preserves edited notes, custom Bases, home and clock", (t) => {
	const root = mkdtempSync(join(tmpdir(), "cms-migration-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const folder of [".git", "cms/devices", "管理面板"])
		mkdirSync(join(root, folder), { recursive: true });
	writeFileSync(
		join(root, "cms/manifest.json"),
		JSON.stringify({ schemaVersion: 1, counts: { devices: 1 } }),
	);
	const authored = {
		"cms/devices/edited.md": noteText({
			cmsId: "edited",
			id: "edited",
			name: "Edited device",
			draft: true,
		}),
		"管理面板/设备.base": "views: []\n# User customized this view\n",
		"首页.md": "# My customized home\n",
	};
	for (const [path, text] of Object.entries(authored))
		writeFileSync(join(root, path), text);
	refreshState(root, "2026-10-24T00:00:00Z");
	authored["cms/publication-state.json"] = readFileSync(
		join(root, "cms/publication-state.json"),
		"utf8",
	);
	for (let run = 0; run < 2; run++)
		execFileSync(process.execPath, ["tools/cms/migrate.mjs", root], {
			stdio: "pipe",
		});
	for (const [path, text] of Object.entries(authored))
		assert.equal(readFileSync(join(root, path), "utf8"), text, path);
});
