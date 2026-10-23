export interface CmsCategory {
	key: string;
	name: string;
	parent?: string;
	description?: string;
}
export interface CmsSeries {
	key: string;
	title: string;
	description?: string;
	cover?: string;
}
export interface CmsMedia {
	key: string;
	title: string;
	kind: "movie" | "book";
	creator?: string;
	status?: string;
	rating?: number;
	date?: string;
	cover?: string;
	description?: string;
	url?: string;
}
const sources = import.meta.glob<{
	categories: CmsCategory[];
	tags: { key: string; name: string }[];
	series: CmsSeries[];
	media: CmsMedia[];
}>("../user/cms-data.json", { eager: true, import: "default" });
const data = sources["../user/cms-data.json"] ?? {
	categories: [],
	tags: [],
	series: [],
	media: [],
};
export const cmsCategories: CmsCategory[] = data.categories as CmsCategory[];
export const cmsTags: { key: string; name: string }[] = data.tags;
export const cmsSeries: CmsSeries[] = data.series;
export const cmsMedia: CmsMedia[] = data.media as CmsMedia[];
export function categoryName(key: string): string {
	return cmsCategories.find((c) => c.key === key)?.name ?? key;
}
export function categoryAncestors(key: string): string[] {
	const result: string[] = [];
	let current = cmsCategories.find((c) => c.key === key);
	while (current?.parent && !result.includes(current.parent)) {
		result.push(current.parent);
		current = cmsCategories.find((c) => c.key === current?.parent);
	}
	return result;
}
export function tagName(key: string): string {
	return cmsTags.find((t) => t.key === key)?.name ?? key;
}
