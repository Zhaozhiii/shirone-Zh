import { existsSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { files } from "./core.mjs";
// Album manifests are build inputs. They may contain passwords and must never
// be copied into the public static root, even though the photos remain static.
const root = resolve(process.argv[2] || "dist");
for (const file of files(join(root, "images/albums")).filter((p) =>
	p.endsWith("info.json"),
))
	rmSync(file);
console.log("Removed build-only album manifests from public output");
