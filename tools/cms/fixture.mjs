import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { domains } from "./model.mjs";
import { refreshState } from "./core.mjs";
const root = resolve(process.argv[2] || "artifacts/cms-fixture");
for (const d of [
	"content/posts",
	"content/moments",
	"content/spec",
	"cms",
	"config",
	"data",
])
	mkdirSync(join(root, d), { recursive: true });
writeFileSync(
	join(root, "cms/manifest.json"),
	JSON.stringify({
		managed: Object.keys(domains).filter((d) => !domains[d].folder),
	}),
);
writeFileSync(
	join(root, "content/spec/about.md"),
	"# About\n\nPublic theme test fixture.\n",
);
writeFileSync(join(root, "config/footer.html"), "");
writeFileSync(
	join(root, "data/music.ts"),
	'import type { TrackDescriptor } from "@/types/musicConfig";\nexport const musicTracks: readonly TrackDescriptor[] = [];\n',
);
refreshState(root);
console.log(root);
