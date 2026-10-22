/** Optional about-page widgets: fill these with your own information. */
export const aboutTechGroups: {
	label: string;
	icon: string;
	items: {
		name: string;
		desc: string;
		icon: string;
		color: string;
		darkColor?: string;
		url: string;
	}[];
}[] = [];
export const aboutMilestones: {
	date: string;
	title: string;
	tag?: string;
	desc: string;
}[] = [];
export const aboutSocialLinks: {
	brand: string;
	href: string;
	platform: string;
	handle: string;
	icon: string;
	note?: string;
}[] = [];
