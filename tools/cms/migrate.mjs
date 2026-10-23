import ts from "typescript";
import {
	existsSync,
	readFileSync,
	mkdirSync,
	writeFileSync,
	rmSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { parse, stringify } from "yaml";
import { domains, folderFor, commonFields } from "./model.mjs";
import {
	noteText,
	readRecords,
	validate,
	refreshState,
	files,
} from "./core.mjs";

const root = resolve(process.argv[2] || "../Shirone-Zh-Content");
if (!existsSync(join(root, ".git"))) throw new Error("仅迁移现有 Git 内容仓");
function write(path, text) {
	if (path instanceof URL) path = fileURLToPath(path);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
}
function literal(node) {
	if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
	if (ts.isObjectLiteralExpression(node))
		return Object.fromEntries(
			node.properties.map((p) => {
				if (!ts.isPropertyAssignment(p)) throw new Error("只支持静态属性");
				return [p.name.text, literal(p.initializer)];
			}),
		);
	if (ts.isStringLiteralLike(node)) return node.text;
	if (ts.isNumericLiteral(node)) return Number(node.text);
	if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
	if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
	if (node.kind === ts.SyntaxKind.NullKeyword) return null;
	if (
		ts.isPrefixUnaryExpression(node) &&
		node.operator === ts.SyntaxKind.MinusToken
	)
		return -literal(node.operand);
	throw new Error("非静态数据需要人工迁移，已停止以保护原始数据");
}
function idFor(domain, index) {
	return createHash("sha256")
		.update(`${domain}:${index}`)
		.digest("hex")
		.slice(0, 16);
}
const adapters = {},
	counts = {};
const hasManifest = existsSync(join(root, "cms/manifest.json"));
if (!hasManifest) {
	const byFile = new Map();
	for (const [d, def] of Object.entries(domains))
		if (def.exports) {
			const name = def.file || d;
			byFile.set(name, [...(byFile.get(name) || []), d]);
		}
	const remove = [];
	for (const [file, ds] of byFile) {
		const path = join(root, `data/${file}.ts`);
		if (!existsSync(path)) continue;
		const text = readFileSync(path, "utf8"),
			ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
		const replacements = [];
		for (const statement of ast.statements)
			if (ts.isVariableStatement(statement))
				for (const dec of statement.declarationList.declarations) {
					const d = ds.find((d) => domains[d].exports.includes(dec.name.text));
					if (!d || !dec.initializer) continue;
					const values = literal(dec.initializer);
					if (!Array.isArray(values)) throw new Error("数据导出不是数组");
					counts[d] = values.length;
					for (const [index, item] of values.entries())
						write(
							join(
								root,
								folderFor(d),
								`${String(index + 1).padStart(3, "0")}-${idFor(d, index)}.md`,
							),
							noteText({
								cmsId: idFor(d, index),
								...item,
								visible: item.enable !== false,
								order: index * 10,
								draft: false,
							}),
						);
					mkdirSync(join(root, folderFor(d)), { recursive: true });
					replacements.push([
						dec.initializer.getStart(ast),
						dec.initializer.end,
						`__CMS_${dec.name.text}__`,
					]);
				}
		let template = text;
		for (const [a, b, replacement] of replacements.sort((a, b) => b[0] - a[0]))
			template = template.slice(0, a) + replacement + template.slice(b);
		adapters[file] = template;
		remove.push(path);
	}
	const announcementPath = join(root, "config/announcement.yaml");
	const announcement = existsSync(announcementPath)
		? parse(readFileSync(announcementPath, "utf8"))
		: {};
	for (const [index, item] of (announcement?.board?.items || []).entries())
		write(
			join(root, "cms/announcements", `${idFor("announcements", index)}.md`),
			noteText({
				cmsId: idFor("announcements", index),
				...item,
				order: index * 10,
				visible: true,
				draft: false,
			}),
		);
	for (const path of files(join(root, "public/images/albums")).filter((p) =>
		p.endsWith("info.json"),
	)) {
		const data = JSON.parse(readFileSync(path, "utf8"));
		const key = path.replaceAll("\\", "/").split("/").at(-2);
		const photos =
			data.photos ||
			files(dirname(path))
				.filter(
					(p) =>
						/\.(jpg|jpeg|png|webp|avif|gif)$/i.test(p) &&
						!/^cover\./.test(p.split(/[\\/]/).at(-1)),
				)
				.map((p) => ({
					src: `/images/albums/${key}/${p.split(/[\\/]/).at(-1)}`,
					alt: "",
				}));
		write(
			join(root, "cms/albums", `${key}.md`),
			noteText({
				cmsId: randomUUID(),
				...data,
				key,
				photos,
				visible: !data.hidden,
				draft: false,
			}),
		);
	}
	for (const d of Object.keys(domains))
		mkdirSync(join(root, folderFor(d)), { recursive: true });
	validate(readRecords(root));
	write(
		new URL("./adapters.json", import.meta.url),
		JSON.stringify(adapters, null, 2) + "\n",
	);
	write(
		join(root, "cms/manifest.json"),
		JSON.stringify(
			{
				schemaVersion: 1,
				managed: Object.keys(domains).filter((d) => !domains[d].folder),
				migratedAt: new Date().toISOString(),
				counts,
			},
			null,
			2,
		) + "\n",
	);
	for (const path of remove) rmSync(path);
	if (announcement?.board?.items) {
		delete announcement.board.items;
		write(announcementPath, stringify(announcement));
	}
}
for (const [domain, def] of Object.entries(domains)) {
	const fields = { ...def.fields, ...commonFields };
	const props = {};
	for (const [key, [label]] of Object.entries(fields))
		if (key !== "password") props[key] = { displayName: label };
	const order = [
		"file.name",
		...Object.keys(fields).filter((k) => k !== "password"),
	];
	write(
		join(root, "管理面板", `${def.label}.base`),
		stringify({
			filters: {
				and: [`file.inFolder("${folderFor(domain)}")`, 'file.ext == "md"'],
			},
			properties: props,
			views: [
				{
					type: "table",
					name: "表格",
					order,
					sort: [{ property: "order", direction: "ASC" }],
				},
				{
					type: "cards",
					name: "卡片",
					order: [
						"file.name",
						"title",
						"name",
						"draft",
						"visible",
						"publishAt",
					],
					image: "note.cover",
					cardSize: 220,
				},
			],
		}),
	);
}
write(
	join(root, "首页.md"),
	"# 博客管理\n\n点击左侧 **Shirone CMS** 图标进入管理后台。\n\n- 用表格和卡片浏览、筛选与排序；双击正文进入 Obsidian 编辑器。\n- 在 CMS 表单中修改属性、选择图片、管理网站设置。\n- 新条目默认草稿；点“发布”后自动同步并构建网站。\n- 已发布内容修改后，停止编辑 60 秒自动同步；也可点“立即同步”。\n- “预览”包含草稿，只在本机开放；支持指定预览时间。\n- 发布时间使用北京时间。到点触发 Actions，部署成功后生效。\n- 密码只在表单显示；请勿在标题、正文或公开描述中填写密码。\n- 音乐歌单自动同步继续由原工作流管理。\n- 网络失败会保留待同步状态；冲突暂停同步，先保留和处理双方修改。\n- 删除进入回收站；历史版本可从 Git 恢复。\n\n## 内容表格\n\n" +
		Object.values(domains)
			.map((d) => `- [[管理面板/${d.label}.base|${d.label}]]`)
			.join("\n") +
		"\n\n请只编辑本内容库，不编辑主题仓的生成副本。\n",
);
refreshState(root);
console.log(
	JSON.stringify({
		migrated: !hasManifest,
		counts: JSON.parse(readFileSync(join(root, "cms/manifest.json"), "utf8"))
			.counts,
		records: readRecords(root).length,
	}),
);
