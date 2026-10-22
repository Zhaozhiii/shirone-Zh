/**
 * 特色页面数据解析与合并工具。
 * 遵循「配置管行为，数据管内容」原则：
 * 将 src/config/*Config.ts 的控制行为（disabledKeys、order 等）
 * 应用于 src/data/*.ts 的内容数据集合。
 */
import { devicesData } from "../data/devices.ts";
import { projectsData } from "../data/projects.ts";
import { skillsData } from "../data/skills.ts";
import { timelineData } from "../data/timeline.ts";
import type { DeviceItem, DevicesConfig } from "../types/devicesConfig.ts";
import type { ProjectItem, ProjectsConfig } from "../types/projectsConfig.ts";
import type { SkillItem, SkillsConfig } from "../types/skillsConfig.ts";
import type { TimelineConfig, TimelineItem } from "../types/timelineConfig.ts";

/**
 * 依据禁用列表过滤条目（纯函数）。
 */
export function filterByDisabledKeys<T>(
	items: readonly T[],
	disabledKeys?: readonly string[],
	getKey: (item: T) => string = (item) =>
		(
			item as unknown as {
				key?: string;
				id?: string;
				name?: string;
				title?: string;
			}
		).key ??
		(
			item as unknown as {
				key?: string;
				id?: string;
				name?: string;
				title?: string;
			}
		).id ??
		(
			item as unknown as {
				key?: string;
				id?: string;
				name?: string;
				title?: string;
			}
		).name ??
		(
			item as unknown as {
				key?: string;
				id?: string;
				name?: string;
				title?: string;
			}
		).title ??
		"",
): T[] {
	if (!disabledKeys || disabledKeys.length === 0) {
		return [...items];
	}
	const disabledSet = new Set(disabledKeys);
	return items.filter((item) => !disabledSet.has(getKey(item)));
}

/**
 * 解析项目页展示数据。
 */
export function resolveProjectsData(
	config: ProjectsConfig,
	customItems?: readonly ProjectItem[],
): ProjectItem[] {
	const source = customItems ?? config.items ?? projectsData;
	const enabledItems = source.filter((item) => item.enable !== false);
	return filterByDisabledKeys(
		enabledItems,
		config.disabledKeys,
		(item) => item.key,
	);
}

/**
 * 解析技能页展示数据。
 */
export function resolveSkillsData(
	config: SkillsConfig,
	customItems?: readonly SkillItem[],
): SkillItem[] {
	const source = customItems ?? config.items ?? skillsData;
	const enabledItems = source.filter((item) => item.enable !== false);
	return filterByDisabledKeys(
		enabledItems,
		config.disabledNames ?? config.disabledKeys,
		(item) => item.name,
	);
}

/**
 * 解析时间线条目日期为可比较区间。
 * 支持 "2026.08" / "2024-11" / "2024/11" / "2024.11.05" 等写法，
 * 以及 "2025.03 – Present" / "2020.09 - 至今" 这类区间。
 * 区间含 Present/至今 时终点记为 Infinity（视为进行中）；
 * 无法识别时返回 -Infinity，使未标注日期的条目稳定排在末尾。
 */
export function parseTimelineDateKey(dateStr?: string | null): {
	start: number;
	end: number;
} {
	const toKey = (raw: string): number => {
		const parts = raw
			.trim()
			.split(/[.\-/]/)
			.map((part) => Number.parseInt(part, 10));
		if (parts.length === 0 || parts.some((part) => Number.isNaN(part))) {
			return Number.NaN;
		}
		const [year, month = 1, day = 1] = parts;
		return year * 10000 + month * 100 + day;
	};

	const value = dateStr ?? "";
	// 仅按「两侧带空格的横杠」切分区间，避免切开 "2024-11" 这类日期自身
	const rangeParts = value.split(/\s+[-–—]\s+/);
	const PRESENT = /present|now|至今|当前/i;

	if (rangeParts.length === 1) {
		const key = toKey(value);
		return Number.isNaN(key)
			? { start: Number.NEGATIVE_INFINITY, end: Number.NEGATIVE_INFINITY }
			: { start: key, end: key };
	}

	const startKey = toKey(rangeParts[0]);
	const start = Number.isNaN(startKey) ? Number.NEGATIVE_INFINITY : startKey;
	const endRaw = rangeParts[1]?.trim() ?? "";
	const end = PRESENT.test(endRaw) ? Number.POSITIVE_INFINITY : toKey(endRaw);
	return { start, end: Number.isNaN(end) ? start : end };
}

/**
 * 解析时间线页展示数据。
 */
export function resolveTimelineData(
	config: TimelineConfig,
	customItems?: readonly TimelineItem[],
): TimelineItem[] {
	const source = customItems ?? config.items ?? timelineData;
	const enabledItems = source.filter((item) => item.enable !== false);
	const filtered = filterByDisabledKeys(
		enabledItems,
		config.disabledTitles ?? config.disabledKeys,
		(item) => item.title,
	);

	const itemsWithIndex = filtered.map((item, index) => ({
		item,
		index,
		dateKey: parseTimelineDateKey(item.date),
	}));
	itemsWithIndex.sort((a, b) => {
		const order = config.order ?? "desc";
		let diff = 0;
		if (a.dateKey.start !== b.dateKey.start) {
			diff = a.dateKey.start - b.dateKey.start;
		} else if (a.dateKey.end !== b.dateKey.end) {
			diff = a.dateKey.end - b.dateKey.end;
		}
		if (diff !== 0 && !Number.isNaN(diff)) {
			return order === "asc" ? diff : -diff;
		}
		// 日期相同或不可比较：保持原书写相对顺序（稳定排序）
		return a.index - b.index;
	});
	return itemsWithIndex.map((x) => x.item);
}

/**
 * 解析设备页展示数据。
 */
export function resolveDevicesData(
	config: DevicesConfig,
	customItems?: readonly DeviceItem[],
): DeviceItem[] {
	const source = customItems ?? config.items ?? devicesData;
	const enabledItems = source.filter((item) => item.enable !== false);
	return filterByDisabledKeys(
		enabledItems,
		config.disabledIds ?? config.disabledKeys,
		(item) => item.id,
	);
}
