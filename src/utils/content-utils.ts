import { type CollectionEntry, getCollection } from "astro:content";
import { pathToFileURL } from "node:url";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import {
	comparePublicationEntries,
	validatePublicationMetadata,
} from "@utils/content-date";
import { siteMarkdownProcessor } from "@utils/markdown-processor";
import { initPostIdMap } from "@utils/permalink-utils";
import { getCategoryUrl, getPostUrl } from "@utils/url-utils";
import {
	categoryAncestors,
	categoryName,
	categoryRank,
	tagName,
	tagRank,
} from "@utils/vault-content";

/** Shared draft policy for every post consumer, including taxonomy counts. */
function getVisiblePosts(): Promise<CollectionEntry<"posts">[]> {
	return getCollection(
		"posts",
		({ data }) => !import.meta.env.PROD || data.draft !== true,
	);
}

async function getRawSortedPosts(): Promise<CollectionEntry<"posts">[]> {
	const allBlogPosts = await getVisiblePosts();

	for (const post of allBlogPosts) validatePublicationMetadata(post);
	// Navigation metadata belongs to this query, not Astro's shared entries.
	const sorted = allBlogPosts
		.map((post) => ({ ...post, data: { ...post.data } }))
		.sort(comparePublicationEntries);
	initPostIdMap(sorted);
	return sorted;
}

export async function getSortedPosts(): Promise<CollectionEntry<"posts">[]> {
	const sorted = await getRawSortedPosts();

	for (let i = 0; i < sorted.length; i++) {
		const next = sorted[i - 1];
		const prev = sorted[i + 1];
		Object.assign(sorted[i].data, {
			nextSlug: next?.id,
			nextTitle: next?.data.title,
			nextUrl: next ? getPostUrl(next) : undefined,
			prevSlug: prev?.id,
			prevTitle: prev?.data.title,
			prevUrl: prev ? getPostUrl(prev) : undefined,
		});
	}

	return sorted;
}

export type PostForList = {
	slug: string;
	data: CollectionEntry<"posts">["data"];
	url?: string;
};

export async function getSortedPostsList(): Promise<PostForList[]> {
	const sortedFullPosts = await getRawSortedPosts();

	// delete post.body, attach pre-calculated URL
	const sortedPostsList: PostForList[] = sortedFullPosts.map((post) => ({
		slug: post.id,
		data: { ...post.data, password: undefined },
		url: getPostUrl(post),
	}));

	return sortedPostsList;
}

export type Tag = {
	name: string;
	key?: string;
	count: number;
};

export async function getTagList(): Promise<Tag[]> {
	const allBlogPosts = await getVisiblePosts();

	const countMap = new Map<string, number>();
	allBlogPosts.forEach((post: { data: { tags: string[] } }) => {
		post.data.tags.forEach((tag: string) => {
			countMap.set(tag, (countMap.get(tag) ?? 0) + 1);
		});
	});

	// sort tags
	const keys = [...countMap.keys()].sort((a, b) => {
		return (
			tagRank(a) - tagRank(b) || a.toLowerCase().localeCompare(b.toLowerCase())
		);
	});

	return keys.map((key) => ({
		name: tagName(key),
		key,
		count: countMap.get(key) ?? 0,
	}));
}

export type Category = {
	key?: string;
	name: string;
	count: number;
	url: string;
	depth?: number;
};

export async function getCategoryList(): Promise<Category[]> {
	const allBlogPosts = await getVisiblePosts();
	const count = new Map<string, number>();
	const increment = (key: string) => count.set(key, (count.get(key) ?? 0) + 1);
	allBlogPosts.forEach((post: { data: { category: string | null } }) => {
		if (!post.data.category) {
			const ucKey = i18n(I18nKey.uncategorized);
			increment(ucKey);
			return;
		}

		const categoryName =
			typeof post.data.category === "string"
				? post.data.category.trim()
				: String(post.data.category).trim();

		increment(categoryName);
		for (const parent of categoryAncestors(categoryName)) increment(parent);
	});

	const paths = new Map(
		[...count.keys()].map((key) => [
			key,
			[...categoryAncestors(key).reverse(), key],
		]),
	);
	const lst = [...count.keys()].sort((a, b) => {
		const ap = paths.get(a) ?? [a];
		const bp = paths.get(b) ?? [b];
		for (let i = 0; i < Math.min(ap.length, bp.length); i++) {
			const difference = categoryRank(ap[i]) - categoryRank(bp[i]);
			if (difference) return difference;
			if (ap[i] !== bp[i]) return ap[i].localeCompare(bp[i]);
		}
		return ap.length - bp.length;
	});

	const ret: Category[] = [];
	for (const c of lst) {
		ret.push({
			key: c,
			name: categoryName(c),
			depth: (paths.get(c)?.length ?? 1) - 1,
			count: count.get(c) ?? 0,
			url: getCategoryUrl(c),
		});
	}
	return ret;
}

// // Moments (动态)：构建期渲染为序列化条目，供页面以 props 传给 Svelte 岛
export type MomentImage = {
	src: string;
	alt: string;
	/** Responsive list thumbnail; the original src remains the viewer/lightbox source. */
	thumbnailSrc?: string;
	thumbnailSrcset?: string;
};

export type MomentItem = {
	id: string;
	/** ISO 字符串（Date 无法跨岛序列化） */
	published: string;
	displayDate?: string;
	/** 正文 HTML（站点统一 markdown 插件链渲染） */
	html: string;
	pinned: boolean;
	location: string;
	/** 心情 Iconify 图标名 */
	mood: string;
	tags: string[];
	images: MomentImage[];
};

/** 渲染器按需创建并缓存（插件加载较重，全构建期只跑一次） */
let momentsRendererPromise: ReturnType<
	typeof siteMarkdownProcessor.createRenderer
> | null = null;

const MOMENT_THUMBNAIL_WIDTHS = [192, 384, 640] as const;

function withMomentThumbnails(image: MomentImage): MomentImage {
	const match = image.src.match(/^\/images\/moments\/(.+)\.([^./]+)$/i);
	if (!match) return image;
	const [, relativePath] = match;
	const candidates = MOMENT_THUMBNAIL_WIDTHS.map((width) => ({
		width,
		src: `/assets/moments/thumbnails/${relativePath}-${width}.webp`,
	}));
	return {
		...image,
		thumbnailSrc: candidates.find(({ width }) => width === 384)?.src,
		thumbnailSrcset: candidates
			.map(({ src, width }) => `${src} ${width}w`)
			.join(", "),
	};
}

function getVisibleMoments(): Promise<CollectionEntry<"moments">[]> {
	return getCollection(
		"moments",
		({ data }) => !import.meta.env.PROD || data.draft !== true,
	);
}

async function renderMoment(
	entry: CollectionEntry<"moments">,
): Promise<string> {
	momentsRendererPromise ??= siteMarkdownProcessor.createRenderer({});
	const renderer = await momentsRendererPromise;
	const { code } = await renderer.render(entry.body ?? "", {
		context: { namespace: `moment-${entry.id}-` },
		...(entry.filePath ? { fileURL: pathToFileURL(entry.filePath) } : {}),
		frontmatter: entry.data as unknown as Record<string, unknown>,
	});
	return code;
}

/** Counting must not initialize Markdown plugins or render every moment. */
export async function getMomentCount(): Promise<number> {
	return (await getVisibleMoments()).length;
}

export async function getSortedMoments(): Promise<MomentItem[]> {
	const sorted = (await getVisibleMoments()).sort(comparePublicationEntries);

	return Promise.all(
		sorted.map(async (entry) => {
			const code = await renderMoment(entry);
			return {
				id: entry.id,
				published: new Date(entry.data.published).toISOString(),
				displayDate: entry.data.displayDate,
				html: code,
				pinned: entry.data.pinned,
				location: entry.data.location,
				mood: entry.data.mood,
				tags: entry.data.tags,
				images: entry.data.images.map(withMomentThumbnails),
			} satisfies MomentItem;
		}),
	);
}

/** 侧栏「最新动态」条目：构建期直出的精简摘要（无 HTML，供纯 SSR widget 使用） */
export type RecentMomentItem = {
	id: string;
	/** ISO 字符串（Date 无法跨岛序列化） */
	published: string;
	displayDate?: string;
	/** 纯文本摘要（HTML 剥离 + 实体解码 + 空白折叠） */
	excerpt: string;
	pinned: boolean;
	/** 是否携带图片（列表中仅以图标徽标提示） */
	hasImage: boolean;
};

/** 渲染后的动态 HTML → 单行纯文本摘要：去注释/style/script → 去标签 → 解码基础实体 → 折叠空白 */
function htmlToExcerpt(html: string): string {
	return html
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * 最新 N 条动态（侧栏 widget 专用）：排序后先截取再渲染 markdown，
 * 只为最近几条付出渲染开销；返回纯文本摘要，组件保持纯 SSR、零客户端请求。
 */
export async function getRecentMomentItems(
	limit: number,
): Promise<RecentMomentItem[]> {
	const count = Math.max(1, Math.floor(limit));
	const recent = (await getVisibleMoments())
		.sort(comparePublicationEntries)
		.slice(0, count);
	if (recent.length === 0) return [];

	return Promise.all(
		recent.map(async (entry) => {
			const code = await renderMoment(entry);
			return {
				id: entry.id,
				published: new Date(entry.data.published).toISOString(),
				displayDate: entry.data.displayDate,
				excerpt: htmlToExcerpt(code),
				pinned: entry.data.pinned,
				hasImage: entry.data.images.length > 0,
			} satisfies RecentMomentItem;
		}),
	);
}
