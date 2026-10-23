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
export function categoryName(key: string): string {
	return vaultCategories.find((c) => c.key === key)?.name ?? key;
}
export function categoryAncestors(key: string): string[] {
	const result: string[] = [];
	let current = vaultCategories.find((c) => c.key === key);
	while (current?.parent && !result.includes(current.parent)) {
		result.push(current.parent);
		current = vaultCategories.find((c) => c.key === current?.parent);
	}
	return result;
}
export function tagName(key: string): string {
	return vaultTags.find((t) => t.key === key)?.name ?? key;
}
