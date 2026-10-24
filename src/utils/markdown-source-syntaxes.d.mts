import type { MarkdownSyntaxSnapshot } from "./markdown-syntaxes.mjs";

export declare function getSourceMarkdownSyntaxSnapshot(
	source?: string,
	options?: { fileURL?: URL; frontmatter?: Record<string, unknown> },
): MarkdownSyntaxSnapshot;
