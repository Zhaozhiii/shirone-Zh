/**
 * 构建平台识别（构建期/SSR 专用，禁止在客户端 `<script>` 中导入）。
 *
 * 通过各平台注入的标志性环境变量识别当前构建/部署平台，用于
 * 侧栏「站点信息」widget 的展示行。非托管构建显示实际操作系统与架构。
 * 环境变量 `SHIRONE_BUILD_PLATFORM` 优先级最高，可强制指定展示名。
 */

/** 各部署平台的标志性环境变量 → 展示名（按检测优先级排列） */
const PLATFORM_MARKERS: readonly (readonly [string, string])[] = [
	["EDGEONE_PROJECT_ID", "EdgeOne Pages"],
	["ESA_PROJECT_ID", "ESA Pages"],
	["CF_PAGES", "Cloudflare Pages"],
	["VERCEL", "Vercel"],
	["NETLIFY", "Netlify"],
	["GITHUB_ACTIONS", "GitHub Actions"],
	["CI", "CI"],
];

/** 识别当前构建平台展示名；`SHIRONE_BUILD_PLATFORM` 可强制覆盖 */
export function detectBuildPlatform(): string {
	const override = process.env.SHIRONE_BUILD_PLATFORM?.trim();
	if (override) return override;

	for (const [marker, name] of PLATFORM_MARKERS) {
		if (process.env[marker]) return name;
	}
	const systems: Record<string, string> = {
		win32: "Windows",
		darwin: "macOS",
		linux: "Linux",
		freebsd: "FreeBSD",
	};
	const architectures: Record<string, string> = {
		x64: "x86_64",
		arm64: "ARM64",
		arm: "ARM",
		ia32: "x86",
	};
	return `${systems[process.platform] ?? process.platform} / ${architectures[process.arch] ?? process.arch}`;
}
