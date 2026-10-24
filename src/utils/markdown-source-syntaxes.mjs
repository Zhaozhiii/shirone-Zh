import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { siteRemarkPlugins } from "./markdown-processor.mjs";

const sourceSyntaxProcessor = unified().use(remarkParse).use(remarkGfm);
for (const plugin of siteRemarkPlugins) sourceSyntaxProcessor.use(plugin);

/**
 * Detects source-only syntax facts for integrations that run before Astro
 * exposes render frontmatter.
 */
export function getSourceMarkdownSyntaxSnapshot(source = "", options = {}) {
	const file = {
		value: source,
		...(options.fileURL ? { path: options.fileURL } : {}),
		data: { astro: { frontmatter: options.frontmatter || {} } },
	};
	sourceSyntaxProcessor.runSync(sourceSyntaxProcessor.parse(source), file);
	return file.data.astro.frontmatter.markdownSyntaxes;
}
