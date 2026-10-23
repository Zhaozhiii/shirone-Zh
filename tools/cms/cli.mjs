import { resolve, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { refreshState, validate, readRecords } from "./core.mjs";
const action = process.argv[2];
const root = resolve(process.argv[3] || "../Shirone-Zh-Content");
if (action === "state") {
	refreshState(root);
	console.log("发布计划已更新");
} else if (action === "validate") {
	validate(readRecords(root));
	console.log("CMS 内容校验通过");
} else if (action === "due") {
	const path = join(root, "cms/publication-state.json");
	const state = JSON.parse(readFileSync(path, "utf8"));
	const now = new Date().toISOString();
	if (state.transitions.some((t) => t > state.evaluatedAt && t <= now)) {
		refreshState(root, now);
		console.log("due");
	} else console.log("unchanged");
} else
	throw new Error(
		"用法：node tools/cms/cli.mjs state|validate|due <内容仓路径>",
	);
