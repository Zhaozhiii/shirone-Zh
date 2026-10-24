/** markdown-processor.mjs 的类型面（实现文件为 .mjs，astro.config 与 content-utils 共用） */

export interface SiteMarkdownRenderResult {
	code: string;
	metadata: Record<string, unknown>;
	diagnostics: {
		code: string;
		source: string;
		line?: number;
		column?: number;
	}[];
}

export interface SiteMarkdownRenderer {
	render(
		content: string,
		renderOpts?: {
			fileURL?: URL;
			frontmatter?: Record<string, unknown>;
			context?: {
				current?: string;
				namespace?: string;
				index?: unknown;
				target?: "web" | "feed";
				backlinks?: Record<string, { title: string; url: string }[]>;
			};
		},
	): Promise<SiteMarkdownRenderResult>;
}

export declare const siteMarkdownProcessor: {
	name: "unified";
	options: {
		remarkPlugins: unknown[];
		rehypePlugins: unknown[];
	};
	createRenderer(
		shared?: Record<string, unknown>,
	): Promise<SiteMarkdownRenderer>;
};

export declare function createSiteMarkdownProcessor(options?: {
	root?: string;
	contentRoot?: string;
}): typeof siteMarkdownProcessor;
