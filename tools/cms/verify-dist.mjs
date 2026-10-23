import { readFileSync } from "node:fs";
import { join } from "node:path";
import { files, readRecords, visible } from "./core.mjs";
/** Scan text outputs and search indexes before they can become a release. */
export function verifyPrivateOutput(source, dist) {
	const records = readRecords(source),
		state = JSON.parse(
			readFileSync(join(source, "cms/publication-state.json"), "utf8"),
		);
	const secrets = records.flatMap((r) => {
		const out = [];
		if (r.data.password)
			out.push({ kind: "password", value: String(r.data.password) });
		if (!visible(r.data, state.evaluatedAt) || r.data.password) {
			const body = r.body.trim();
			if (body.length > 20) out.push({ kind: "body", value: body });
		}
		return out;
	});
	for (const file of files(dist).filter((p) =>
		/\.(html|json|js|xml|txt|map)$/.test(p),
	)) {
		const text = readFileSync(file, "utf8");
		for (const token of secrets) {
			const secret = token.value;
			// Short demo passwords (for example "test") also occur in third-party
			// JavaScript APIs. Check their serialized password context rather than
			// matching every regex .test() call in the application bundle.
			if (token.kind === "password" && secret.length < 12) {
				const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				if (
					new RegExp(
						`(?:["']?password["']?|&quot;password&quot;)\\s*[:=]\\s*(?:\\[\\d+,\\s*)?(?:["']|&quot;)${escaped}(?:["']|&quot;)`,
						"i",
					).test(text)
				)
					throw new Error(
						`Serialized password found in public output: ${file}`,
					);
				continue;
			}
			if (
				secret.length >= 4 &&
				(text.includes(secret) ||
					text.includes(JSON.stringify(secret).slice(1, -1)))
			)
				throw new Error(
					`Private ${token.kind} detected in public build output: ${file}`,
				);
		}
	}
}
if (process.argv[2]) {
	verifyPrivateOutput(process.argv[2], process.argv[3] || "dist");
	console.log("Verified private content boundaries");
}
