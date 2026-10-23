import ts from "typescript";
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { resolve, join } from "node:path";
import { introspectConfig } from "../../scripts/content/config-introspect.mjs";
import { CONFIG_DOMAINS } from "../../scripts/content/config-domains.mjs";
const root = resolve(import.meta.dirname, "../..");
const config = ts.readConfigFile(join(root, "tsconfig.json"), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, {
	...parsed.options,
	noEmit: true,
});
const checker = program.getTypeChecker();
function schema(type, depth = 0) {
	if (depth > 7) return { type: "object" };
	if (type.isUnion()) {
		const members = type.types.filter(
			(t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)),
		);
		if (members.every((t) => t.flags & ts.TypeFlags.BooleanLiteral))
			return { type: "boolean" };
		if (
			members.every(
				(t) =>
					t.flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral),
			)
		)
			return {
				type:
					members[0].flags & ts.TypeFlags.NumberLiteral ? "number" : "string",
				enum: members.map((t) => t.value),
			};
		const object = members.find((t) => t.flags & ts.TypeFlags.Object);
		return schema(object || members[0], depth + 1);
	}
	if (type.flags & ts.TypeFlags.StringLike) return { type: "string" };
	if (type.flags & ts.TypeFlags.NumberLike) return { type: "number" };
	if (type.flags & ts.TypeFlags.BooleanLike) return { type: "boolean" };
	if (checker.isArrayType(type) || checker.isTupleType(type))
		return {
			type: "array",
			items: schema(
				checker.getTypeArguments(type)[0] || checker.getStringType(),
				depth + 1,
			),
		};
	const properties = {};
	for (const prop of checker.getPropertiesOfType(type)) {
		const declaration = prop.valueDeclaration || prop.declarations?.[0];
		if (!declaration) continue;
		const help = ts.displayPartsToString(prop.getDocumentationComment(checker));
		properties[prop.name] = {
			...schema(
				checker.getTypeOfSymbolAtLocation(prop, declaration),
				depth + 1,
			),
			description: help.split("\n")[0],
			label: help.split(/[（。，\n]/)[0] || prop.name,
		};
	}
	return { type: "object", properties };
}
const introspected = introspectConfig(root),
	result = {};
for (const domain of CONFIG_DOMAINS) {
	let found;
	for (const source of program.getSourceFiles())
		if (source.fileName.replaceAll("\\", "/").includes("/src/types/"))
			for (const st of source.statements)
				if (
					(ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) &&
					st.name.text === domain.type
				) {
					const symbol = checker.getSymbolAtLocation(st.name);
					found = schema(checker.getDeclaredTypeOfSymbol(symbol));
				}
	result[domain.file] = {
		defaults: introspected.values[domain.key]?.defaults || {},
		schema: found || { type: "object" },
	};
}
const navItem = {
	type: "object",
	properties: {
		preset: {
			type: "string",
			enum: [
				"Home",
				"Archive",
				"Categories",
				"Tags",
				"Series",
				"Friends",
				"Moments",
				"Anime",
				"Compass",
				"Albums",
				"About",
				"Projects",
				"Skills",
				"Timeline",
				"Devices",
				"Guestbook",
				"Sponsor",
				"GitHub",
				"Rss",
				"Atom",
			],
		},
		name: { type: "string" },
		url: { type: "string" },
		icon: { type: "string" },
		pageKey: { type: "string" },
		external: { type: "boolean" },
	},
};
navItem.properties.children = {
	type: "array",
	items: { ...navItem, properties: { ...navItem.properties } },
};
result["nav-bar"] = {
	defaults: { links: [] },
	schema: {
		type: "object",
		properties: { links: { type: "array", items: navItem } },
	},
};
writeFileSync(
	join(root, "tools/cms/settings-schema.json"),
	JSON.stringify(result, null, 2) + "\n",
);
const output = resolve(process.argv[2] || join(root, "artifacts/cms"));
mkdirSync(output, { recursive: true });
await build({
	entryPoints: [join(root, "tools/cms/main.mjs")],
	outfile: join(output, "main.js"),
	bundle: true,
	external: ["obsidian", "electron"],
	format: "cjs",
	platform: "node",
	target: "es2022",
	minify: false,
});
writeFileSync(
	join(output, "manifest.json"),
	JSON.stringify(
		{
			id: "shirone-cms",
			name: "Shirone CMS",
			version: "1.0.0",
			minAppVersion: "1.12.7",
			description: "在 Obsidian 中可视化管理 Shirone 博客、预览、同步与发布。",
			author: "Zhaozhiii",
			isDesktopOnly: true,
		},
		null,
		2,
	) + "\n",
);
cpSync(join(root, "tools/cms/styles.css"), join(output, "styles.css"));
console.log("CMS 插件已构建：" + output);
