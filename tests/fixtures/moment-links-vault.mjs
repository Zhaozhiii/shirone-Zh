import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { noteText } from "../../tools/vault/core.mjs";

// Add deterministic link/pagination cases to a synthetic Vault, never the user's notes.
const root = resolve(process.argv[2]);
mkdirSync(join(root, "博客"), { recursive: true });
mkdirSync(join(root, "附件"), { recursive: true });
writeFileSync(
	join(root, "附件/link-cover.svg"),
	'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="gray"/></svg>',
);
writeFileSync(
	join(root, "link-album.md"),
	noteText(
		{
			type: "album",
			publish: true,
			key: "link-album",
			title: "Link album",
			cover: "附件/link-cover.svg",
			tags: ["links"],
		},
		"![Link cover](附件/link-cover.svg)\n",
	),
);
writeFileSync(
	join(root, "博客/链接目标.md"),
	noteText(
		{ type: "article", publish: true, slug: "link-target" },
		"# Link target\n\nLINK_TARGET_BODY\n\n[Old moment](../动态12)\n",
	),
);
for (let index = 1; index <= 12; index++) {
	writeFileSync(
		join(root, `动态${index}.md`),
		noteText(
			{
				type: "moment",
				publish: true,
				slug: `link-moment-${index}`,
				date: `2026-10-${String(27 - index).padStart(2, "0")}`,
				tags: ["links"],
			},
			index === 1
				? "[设计文档](博客/链接目标)\n\n[Old moment](动态12)\n\n[External](https://example.com/)\n"
				: `Link fixture moment ${index}\n`,
		),
	);
}
