export interface VaultCategory {
	key: string;
	name: string;
	parent?: string;
	description?: string;
}
export interface VaultSeries {
	key: string;
	title: string;
	description?: string;
	cover?: string;
}
export interface VaultMedia {
	key: string;
	title: string;
	kind: "movie" | "book";
	creator?: string;
	year?: string;
	status?: string;
	rating?: number;
	date?: string;
	cover?: string;
	description?: string;
	url?: string;
}
const sources = import.meta.glob<{
	categories: VaultCategory[];
	tags: { key: string; name: string }[];
	series: VaultSeries[];
	media: VaultMedia[];
}>("../user/vault-data.json", { eager: true, import: "default" });
const data = sources["../user/vault-data.json"] ?? {
	categories: [],
	tags: [],
	series: [],
	media: [],
};
export const vaultCategories: VaultCategory[] =
	data.categories as VaultCategory[];
export const vaultTags: { key: string; name: string }[] = data.tags;
export const vaultSeries: VaultSeries[] = data.series;
export const vaultMedia: VaultMedia[] = data.media as VaultMedia[];
const categoriesByKey = new Map(
	vaultCategories.map((item) => [item.key, item]),
);
const tagsByKey = new Map(vaultTags.map((item) => [item.key, item]));
const categoryRanks = new Map(
	vaultCategories.map((item, index) => [item.key, index]),
);
const tagRanks = new Map(vaultTags.map((item, index) => [item.key, index]));

export function categoryRank(key: string): number {
	return categoryRanks.get(key) ?? Number.MAX_SAFE_INTEGER;
}
export function tagRank(key: string): number {
	return tagRanks.get(key) ?? Number.MAX_SAFE_INTEGER;
}
export function categoryName(key: string): string {
	return categoriesByKey.get(key)?.name ?? key;
}
export function categoryAncestors(key: string): string[] {
	const result: string[] = [];
	const seen = new Set([key]);
	let current = categoriesByKey.get(key);
	while (current?.parent && !seen.has(current.parent)) {
		result.push(current.parent);
		seen.add(current.parent);
		current = categoriesByKey.get(current.parent);
	}
	return result;
}
export function tagName(key: string): string {
	return tagsByKey.get(key)?.name ?? key;
}
