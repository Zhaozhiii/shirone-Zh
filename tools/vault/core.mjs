import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	readFileSync,
	readdirSync,
	mkdirSync,
	writeFileSync,
	rmSync,
	copyFileSync,
	statSync,
	lstatSync,
	realpathSync,
} from "node:fs";
import { join, resolve, relative, dirname, posix } from "node:path";
import { parse, stringify } from "yaml";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { domains } from "./model.mjs";
import { instant, normalizeTime, shanghaiDate } from "./time.mjs";
export { instant } from "./time.mjs";
import adapters from "./adapters.json" with { type: "json" };

export const types = Object.freeze({
  article: "posts", moment: "moments", movie: "media", book: "media", media: "media",
  device: "devices", project: "projects", friend: "friends", link: "links",
  category: "categories", tag: "tags", series: "series", announcement: "announcements",
  album: "albums", skill: "skills", timeline: "timeline", anime: "anime", page: "pages",
  aboutTechGroup: "aboutTechGroups", aboutMilestone: "aboutMilestones", aboutSocialLink: "aboutSocialLinks",
});
const metadata = new Set([
	"cmsId", "type", "publish", "passwordSecret", "slug",
	"draft",
	"visible",
	"order",
	"publishAt",
	"unpublishAt",
	"hidden",
	"enable",
]);
export function files(root) {
	if (!existsSync(root)) return [];
	return readdirSync(root, { withFileTypes: true })
		.filter((e) => !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "模板" && !e.isSymbolicLink())
		.flatMap((e) =>
			e.isDirectory() ? files(join(root, e.name)) : [join(root, e.name)],
		);
}
export function readNote(text) {
	const m = text
		.replace(/^\uFEFF/, "")
		.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	return {
		data: m ? parse(m[1]) || {} : {},
		body: m ? text.slice(m[0].length) : text,
	};
}
export function noteText(data, body = "") {
	return `---\n${stringify(data, { lineWidth: 0 }).trimEnd()}\n---\n\n${body.replace(/^\n+/, "")}`;
}
export function visible(data, time) {
	if (data.publish !== true || data.draft === true || data.visible === false) return false;
	const start = instant(data.publishAt),
		end = instant(data.unpublishAt);
	return (
		data.publish === true &&
		data.draft !== true &&
		data.visible !== false &&
		(!start || start <= time) &&
		(!end || end > time)
	);
}
/** Only explicit types opt into the build schema; ordinary notes remain ordinary notes. */
export function readRecords(root) {
  const records = [];
  for (const file of files(root).filter(p => /\.md$/i.test(p))) {
    let note;
    const authored = readFileSync(file,"utf8");
    try { note = readNote(authored); }
    catch {
      const header = authored.replace(/^\uFEFF/, "").match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] || "";
      if (/\bpublish\s*:\s*true\b/.test(header)) throw new Error("A public note contains invalid YAML. Fix its Properties before publishing.");
      continue;
    }
    const domain = Object.hasOwn(types,note.data.type) ? types[note.data.type] : undefined;
    if (!domain) continue;
    const path = relative(root, file).replaceAll("\\", "/");
    const data = { ...note.data };
    const name = posix.basename(path, ".md");
    data.title ??= name;
    data.key ??= data.slug || data.id || name;
    const slug = value => String(value).normalize("NFC").trim().replace(/[^\p{L}\p{N}_.\/-]+/gu,"-").replace(/^-+|-+$/g,"") || createHash("sha256").update(path).digest("hex").slice(0,16);
    if (["media","albums"].includes(domain)) data.key=slug(data.key).replaceAll("/","-").replaceAll(".","-");
    let createdDate;
    const creationDate = () => {
      if (createdDate) return createdDate;
      let created;
      try {
        created = execFileSync("git",["log","--follow","--diff-filter=A","--format=%aI","--",path],{cwd:root,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim().split("\n").at(-1);
      } catch { /* Uncommitted offline notes use their local creation time. */ }
      createdDate = data.created ? normalizeTime(data.created, `${path}：创建日期`).slice(0,10) : shanghaiDate(created || statSync(file).birthtime);
      return createdDate;
    };
    if (["posts", "moments"].includes(domain)) {
      if (!data.published) {
        data.published = data.publish === true ? (data.publishAt ? normalizeTime(data.publishAt, `${path}：发布时间`, creationDate).slice(0,10) : creationDate()) : String(data.created || statSync(file).birthtime.toISOString()).slice(0,10);
      }
      data.alias ??= slug(data.slug || data.id || name);
      if (domain === "posts") data.image ??= data.cover;
    }
    if (data.publish === true) {
      if (data.published) {
        const published = normalizeTime(data.published, `${path}：发布日期`, creationDate);
        if (domain === "posts") {
          data.published = published.slice(0,10);
          if (published.includes("T")) data.publishedAt ||= published;
        } else data.published = published;
      }
      const referenceDate = () => data.published?.slice(0,10) || creationDate();
      const dateFields = ["publishAt", "unpublishAt", "publishedAt", "updatedAt", "updated"];
      if (domains[domain]?.fields?.date?.[1] === "date") dateFields.push("date");
      for (const field of dateFields) {
        if (data[field] === undefined) continue;
        if (data[field] === "" || data[field] === null) { delete data[field]; continue; }
        data[field] = normalizeTime(data[field], `${path}：${field}`, field === "updatedAt" && data.updated ? () => normalizeTime(data.updated).slice(0,10) : referenceDate);
      }
    }
    if (["movie", "book"].includes(data.type)) data.kind ??= data.type;
    if (domain === "devices") {
      data.id ??= data.key; data.name ??= data.title; data.brand ??= "";
      data.category ??= "other"; data.status ??= "active"; data.specs ??= data.model || "";
      data.description = note.body.trim() || data.description || ""; data.image ??= data.photo || data.cover;
    }
    if (domain === "projects") {
      data.summary = note.body.trim() || data.summary || ""; data.category ??= "other";
      data.phase ??= "building"; data.technologies ??= [];
    }
    if (domain === "friends") {
      data.id ??= parseInt(createHash("sha256").update(String(data.key)).digest("hex").slice(0,8),16);
      data.siteurl ??= data.url; data.imgurl ??= data.cover || "";
      data.desc = note.body.trim() || data.desc || ""; data.tags ??= [];
    }
    if (domain === "announcements") data.content = note.body.trim() || data.content || "";
    if (["skills","timeline","anime"].includes(domain)) data.description = note.body.trim() || data.description || "";
    if (domain === "media") data.description ??= note.body.trim();
    if (domain === "media") { data.creator ??= data.director || data.author; if (data.year !== undefined) data.year=String(data.year); }
    if (domain === "albums") {
      const images=[],ranges=[];
      const visit=node=>{
        if(["code","inlineCode"].includes(node.type))ranges.push([node.position.start.offset,node.position.end.offset]);
        if(node.type==="image")images.push({src:node.url,alt:node.alt || "",offset:node.position.start.offset});
        for(const child of node.children || [])visit(child);
      };
      visit(unified().use(remarkParse).parse(note.body));
      for(const m of note.body.matchAll(/!\[\[([^\]]+)\]\]/g)) {
        if(ranges.some(([a,b])=>m.index>=a && m.index<b))continue;
        const [src,alt]=m[1].split("|");images.push({src,alt:alt && !/^\d+(?:x\d+)?$/.test(alt)?alt:"",offset:m.index});
      }
      if(images.length)data.photos=images.sort((a,b)=>a.offset-b.offset).map(({offset,...image})=>({...data.photos?.find?.(old=>old.src===image.src),...image}));
      data.description=note.body.replace(/!\[\[[^\]]+\]\]/g,"").replace(/!\[[^\]]*\]\([^)]+\)/g,"").trim() || data.description || "";
    }
    if (data.passwordSecret && data.publish === true) {
      if (!/^[A-Z][A-Z0-9_]+$/.test(data.passwordSecret)) throw new Error("Invalid password secret reference");
      let passwords;
      try { passwords = JSON.parse(process.env.VAULT_PASSWORDS || "{}"); }
      catch { throw new Error("The encryption secret map is not valid JSON"); }
      data.password = process.env[data.passwordSecret] || passwords[data.passwordSecret];
      if (!data.password) throw new Error("A public note references an unavailable encryption secret");
    }
    records.push({ ...note, data, domain, path, file });
  }
  return records;
}
export function validate(records) {
  records = records.filter(r => r.data.publish === true);
	const seen = new Set();
	for (const r of records) {
		const key =
			r.data.cmsId || `${r.domain}:${r.data.key ?? r.data.id ?? r.path}`;
		if (seen.has(key)) throw new Error(`标识重复：${r.path}`);
		seen.add(key);
		for (const [field, [label, type, required, values]] of Object.entries({
			...(domains[r.domain]?.fields || {}),
			order: ["排序", "number"],
			draft: ["草稿", "boolean"],
			visible: ["显示", "boolean"],
		})) {
			const value = r.data[field];
			if (required && (value === undefined || value === null))
				throw new Error(`${r.path}：请填写${label}`);
			if (value === undefined || value === null || value === "") continue;
			if (
				type === "number" &&
				(typeof value !== "number" || !Number.isFinite(value))
			)
				throw new Error(`${r.path}：${label}必须为数字`);
			if (type === "boolean" && typeof value !== "boolean")
				throw new Error(`${r.path}：${label}必须为开关`);
			if (
				["text", "textarea", "url", "image", "date", "datetime"].includes(
					type,
				) &&
				typeof value !== "string"
			)
				throw new Error(`${r.path}：${label}必须为文字`);
			if (
				type === "tags" &&
				(!Array.isArray(value) || value.some((v) => typeof v !== "string"))
			)
				throw new Error(`${r.path}：${label}必须为文字列表`);
			if (values && !values.includes(value))
				throw new Error(`${r.path}：${label}选项无效`);
		}
		const start = instant(r.data.publishAt),
			end = instant(r.data.unpublishAt);
		if (start && end && end <= start)
			throw new Error(`${r.path}：下线时间必须晚于发布时间`);
		if (r.data.encrypted && !String(r.data.password || "").trim())
			throw new Error(`${r.path}：请设置访问密码`);
		if (
			r.domain === "media" &&
			r.data.rating !== undefined &&
			(r.data.rating < 0 || r.data.rating > 10)
		)
			throw new Error(`${r.path}：评分须为 0–10`);
		if (
			r.domain === "albums" &&
			r.data.columns !== undefined &&
			![2, 3, 4].includes(r.data.columns)
		)
			throw new Error(`${r.path}：相册列数须为 2、3 或 4`);
		if (
			r.domain === "posts" &&
			!/^\d{4}-\d\d-\d\d$/.test(String(r.data.published))
		)
			throw new Error(`${r.path}：发布日期须为 YYYY-MM-DD`);
		if (r.domain === "moments") {
			instant(r.data.published, `${r.path}：动态时间`);
		}
	}
	for (const domain of ["categories", "tags", "series"]) {
		const list = records.filter((r) => r.domain === domain),
			byKey = new Map();
		for (const r of list) {
			if (byKey.has(r.data.key)) throw new Error(`${domain} 标识重复`);
			byKey.set(r.data.key, r);
		}
		if (domain === "categories")
			for (const r of list) {
				const chain = new Set([r.data.key]);
				let parent = r.data.parent;
				while (parent) {
					if (chain.has(parent)) throw new Error("分类层级存在循环");
					chain.add(parent);
					const p = byKey.get(parent);
					if (!p) throw new Error(`父分类不存在：${r.path}`);
					parent = p.data.parent;
				}
			}
	}
	const cats = new Set(
		records.filter((r) => r.domain === "categories").map((r) => r.data.key),
	);
	const series = new Set(
		records.filter((r) => r.domain === "series").map((r) => r.data.key),
	);
	for (const r of records.filter((r) => r.domain === "posts")) {
		// A category or series property can introduce a new name without a separate definition note.
	}
	return records;
}
export function schedule(records) {
	return [
		...new Set(
			records
				.filter(r => r.data.publish === true)
				.flatMap((r) => [
					instant(r.data.publishAt),
					instant(r.data.unpublishAt),
				])
				.filter(Boolean),
		),
	].sort();
}
export function publicationState(
	records,
	evaluatedAt = new Date().toISOString(),
) {
	const transitions = schedule(records);
	return {
		schemaVersion: 1,
		evaluatedAt: instant(evaluatedAt),
		transitions,
		scheduleHash: createHash("sha256")
			.update(JSON.stringify(transitions))
			.digest("hex"),
	};
}
function write(path, text) {
	mkdirSync(dirname(path), { recursive: true });
	if (!existsSync(path) || readFileSync(path, "utf8") !== text)
		writeFileSync(path, text);
}
function safe(root, path) {
	const resolved = resolve(root, path);
  // Refuse links/junctions even when they currently resolve inside the root.
  let cursor = resolved;
  while (cursor !== resolve(root) && cursor !== dirname(cursor)) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error("Symbolic links are not allowed");
    cursor = dirname(cursor);
  }
	if (
		!resolved.startsWith(resolve(root) + posix.sep) &&
		!resolved.startsWith(resolve(root) + "\\")
	)
		throw new Error("路径超出博客库");
	return resolved;
}
function cleanData(r) {
	return Object.fromEntries(
		Object.entries(r.data).filter(([k]) => !metadata.has(k) && (k in (domains[r.domain]?.fields || {})) && (k !== "password" || r.domain === "albums")),
	);
}
export function compileVault({
	sourceRoot,
	root,
	production = false,
	dryRun = false,
	previewAt,
}) {
  const manifest = { managed: Object.keys(domains) };
  const records = readRecords(sourceRoot);
  validate(records);
  const time = instant(previewAt || process.env.VAULT_BUILD_AT || new Date().toISOString());
  const active = r => visible(r.data, time);
	let sorted = records
		.filter(active)
		.sort(
			(a, b) =>
				(a.data.order ?? 0) - (b.data.order ?? 0) ||
				a.path.localeCompare(b.path),
		);
  const shelves = new Map();
  for (const r of sorted.filter(r => r.domain === "links")) {
    const group = r.data.group || "常用";
    const shelf = shelves.get(group) || { domain:"compass", path:r.path, data:{key:createHash("sha256").update(group).digest("hex").slice(0,12),name:group,entries:[]}};
    if (!/^https?:\/\//.test(r.data.url || "")) throw new Error("A public navigation link needs an HTTPS/HTTP URL");
    shelf.data.entries.push({ label:r.data.title,href:r.data.url,note:r.data.description || r.body.trim(),icon:r.data.icon,image:r.data.cover });
    shelves.set(group,shelf);
  }
  sorted = [...sorted,...shelves.values()];
  for (const post of sorted.filter(r => r.domain === "posts")) {
    for (const [domain,values] of [["categories",[post.data.category]],["series",[post.data.series]],["tags",post.data.tags || []]]) {
      for (const key of values.filter(Boolean)) {
        if (!sorted.some(r=>r.domain===domain && r.data.key===key)) sorted.push({domain,path:post.path,data:{key,name:key,title:key}});
      }
    }
  }
	const outputs = new Map();
	const output = (path, text) => {
    if (outputs.has(path) && path.startsWith("src/content/")) throw new Error("Duplicate public note slug");
    outputs.set(path, text);
  };
	const assetPaths = new Set();
  const allowedAssets = /\.(png|jpe?g|webp|avif|gif|svg|pdf|mp3|mp4|ogg|webm|woff2?)$/i;
  const allFiles = files(sourceRoot).map(p => relative(sourceRoot,p).replaceAll("\\","/"));
  function resolveFile(value, notePath = "") {
    let name;
    try { name = decodeURIComponent(value).replaceAll("\\", "/"); } catch { throw new Error("Invalid resource path"); }
    name = name.replace(/^\/+/, "");
    const relativeName = posix.normalize(posix.join(posix.dirname(notePath), name));
    const exact = [relativeName, name].filter(p => allFiles.includes(p));
    const matches = [...new Set(exact.length ? exact.slice(0,1) : allFiles.filter(p => p.endsWith("/"+name) || posix.basename(p) === name))];
    if (matches.length !== 1) return null;
    safe(sourceRoot, matches[0]);
    return matches[0];
  }
  function asset(value, notePath = "") {
    if (typeof value !== "string" || !value) return value;
    value = value.replace(/^!?\[\[([^\]]+)\]\]$/, "$1").split("|")[0];
    if (/^(https?:|data:|#)/i.test(value)) return value;
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) throw new Error("Unsupported resource scheme");
    const found = resolveFile(value.split("#")[0], notePath);
    if (!found) {
      // Absolute URLs of code-owned site assets may remain unchanged.
      if (value.startsWith("/") && existsSync(safe(join(root,"site/public"), value.slice(1)))) return value;
      if (value.startsWith("assets/") && (existsSync(safe(join(root,"src"), value)) || existsSync(safe(join(root,"site"),value)))) return value;
      throw new Error(`A published resource is missing or ambiguous: ${value}`);
    }
    if (!allowedAssets.test(found)) throw new Error("Only supported attachments may be published");
    const hash = createHash("sha256").update(readFileSync(safe(sourceRoot,found))).digest("hex");
    const dest = `public/images/vault/${hash}${posix.extname(found).toLowerCase()}`;
    assetPaths.add(found);
    assetOutputs.set(found, dest);
    return "/" + dest.slice("public/".length);
  }
  const assetOutputs = new Map();
  const imageFields = new Set(["cover","image","src","imgurl","avatar","photo","poster","thumbnail"]);
  function mapAssets(v, notePath = "", field = "") {
    if (typeof v === "string") return imageFields.has(field) || /^!?\[\[|^附件\//.test(v) ? asset(v,notePath) : v;
    if (Array.isArray(v)) return v.map(x => mapAssets(x,notePath,field));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k,x]) => [k,mapAssets(x,notePath,k)]));
    return v;
  }
	const noteTargets = new Map();
	for (const r of records.filter(
		(r) => ["posts", "moments", "media", "pages"].includes(r.domain) && active(r),
	)) {
    const url = r.domain === "posts" ? r.data.permalink ? "/"+r.data.permalink.replace(/^\/+|\/+$/g, "")+"/" : `/posts/${r.data.alias}/`
      : r.domain === "media" ? `/media/${r.data.key}/` : r.domain === "pages" ? `/${r.data.key}/` : "/moments/";
		for (const key of [
			r.path.replace(/\.md$/, ""),
			r.path.split("/").at(-1).replace(/\.md$/, ""),
			r.data.title,
		].filter(Boolean)) {
			const existing = noteTargets.get(key);
			noteTargets.set(
				key,
				noteTargets.has(key) && existing !== url ? null : url,
			);
		}
	}
  function wiki(body, path) {
    const ranges = [];
    const tree = unified().use(remarkParse).parse(body);
    const visit = node => {
      if (["code","inlineCode"].includes(node.type)) ranges.push([node.position.start.offset,node.position.end.offset]);
      for (const child of node.children || []) visit(child);
    };
    visit(tree);
    const replacements = [];
    const protectedAt = offset => ranges.some(([a,b]) => offset >= a && offset < b);
    for (const match of body.matchAll(/(!?)\[\[([^\]]+)\]\]/g)) {
      if (protectedAt(match.index)) continue;
      const [,embed,inside] = match, [target,label] = inside.split("|"), [name,anchor] = target.split("#");
      let text;
      if (embed) text = `![${label && !/^\d+(?:x\d+)?$/.test(label) ? label : ""}](${asset(name,path)})`;
      else {
        const resolved = posix.normalize(posix.join(posix.dirname(path), name)).replace(/\.md$/i, "");
        const url = noteTargets.get(resolved) || noteTargets.get(name.replace(/\.md$/i,""));
        // A link to a private note becomes plain display text, never a transclusion.
        text = url ? `[${label || name}](${url}${anchor ? "#"+encodeURIComponent(anchor) : ""})` : (label || name);
      }
      replacements.push([match.index,match.index+match[0].length,text]);
    }
    function links(node) {
      if (["link", "image", "definition"].includes(node.type) && !/^(https?:|mailto:|tel:|#|data:)/i.test(node.url)) {
        const original = node.url, found = resolveFile(original.split("#")[0], path);
        let url;
        if (found && /\.md$/i.test(found)) {
          url = noteTargets.get(found.replace(/\.md$/i,""));
          if (!url) throw new Error("A published Markdown link points to a private note; use a plain wiki link instead");
        } else if (node.type !== "image" && original.startsWith("/") && !found) url = original;
        else url = asset(original,path);
        const segment = body.slice(node.position.start.offset,node.position.end.offset);
        const offset = segment.lastIndexOf(original);
        if (offset >= 0) replacements.push([node.position.start.offset+offset,node.position.start.offset+offset+original.length,url]);
      }
      for (const child of node.children || []) links(child);
    }
    links(tree);
    // Resolve HTML image/video resources as well; includes may only read already public materialized files.
    for (const match of body.matchAll(/@include\s*:|@\s*\[\s*code-tree\b|\[\s*@code-tree\b|:{1,3}code-tree\b|<%|!\[\[.*\.md(?:\||\]\])/gi)) {
      if (!protectedAt(match.index)) throw new Error("File transclusions are not allowed in public Vault notes");
    }
    for (const m of body.matchAll(/\b(src|poster)=["']([^"']+)["']/g)) {
      if (protectedAt(m.index) || /^(https?:|data:)/i.test(m[2])) continue;
      const offset = m.index + m[0].indexOf(m[2]);
      replacements.push([offset,offset+m[2].length,asset(m[2],path)]);
    }
    for (const [start,end,text] of replacements.sort((a,b)=>b[0]-a[0])) body = body.slice(0,start)+text+body.slice(end);
    return body;
  }
  for (const r of sorted.filter(r => ["posts","moments","pages"].includes(r.domain))) {
    const collection = r.domain === "pages" ? "spec" : r.domain;
    const id = r.domain === "pages" ? r.data.key : r.data.alias;
    if (!/^[\p{L}\p{N}_./-]+$/u.test(String(id)) || String(id).split("/").includes("..")) throw new Error("Invalid public note slug");
    if (r.domain === "pages" && !["about","friends"].includes(id)) throw new Error("Unsupported special page");
    const fields = new Set([...Object.keys(domains[r.domain]?.fields || {}),"title","order","updated","updatedAt"]);
    const data = mapAssets(Object.fromEntries(Object.entries(r.data).filter(([key])=>fields.has(key))),r.path);
    output(`src/content/${collection}/${id}.md`, noteText(data,wiki(r.body,r.path)));
  }
  for (const r of sorted.filter(r => r.domain === "media")) {
    if (!/^[\p{L}\p{N}_-]+$/u.test(String(r.data.key))) throw new Error("Invalid media slug");
    output(`src/content/spec/media/${r.data.key}.md`, noteText({},wiki(r.body,r.path)));
  }
	const data = { categories: [], tags: [], series: [], media: [] };
	for (const domain of Object.keys(data))
		data[domain] = sorted
			.filter((r) => r.domain === domain)
			.map((r) => mapAssets(cleanData(r), r.path));
	output("src/user/vault-data.json", JSON.stringify(data, null, 2) + "\n");
	for (const [file, adapter] of Object.entries(adapters)) {
		const fileDomains = Object.keys(domains).filter(
			(d) => (domains[d].file || d) === file && domains[d].exports,
		);
		if (!fileDomains.some((d) => manifest.managed.includes(d))) continue;
		let text = adapter;
		for (const d of fileDomains)
			for (const exp of domains[d].exports) {
				text = text.replace(
					`__VAULT_${exp}__`,
					JSON.stringify(
						sorted
							.filter((r) => r.domain === d)
							.map((r) => mapAssets(cleanData(r), r.path)),
						null,
						2,
					),
				);
			}
		output(`src/data/${file}.ts`, text);
	}
	const configRoot = join(root, ".vault-cache");
	for (const path of files(join(root, "site/config"))) {
		const rel = relative(join(root, "site/config"), path).replaceAll(
			"\\",
			"/",
		);
		const text = readFileSync(path, "utf8");
		output(
			`.vault-cache/config/${rel}`,
			/\.ya?ml$/.test(rel)
				? stringify(mapAssets(parse(text)))
				: text,
		);
	}
	if (manifest.managed.includes("announcements")) {
		const path = join(root, "site/config/announcement.yaml");
		const original = existsSync(path)
			? parse(readFileSync(path, "utf8")) || {}
			: {};
		const items = sorted
			.filter((r) => r.domain === "announcements")
			.map((r) => mapAssets(cleanData(r), r.path));
		output(
			".vault-cache/config/announcement.yaml",
			stringify({
				...original,
				board: {
					...original.board,
					enable: original.board?.enable ?? items.length > 0,
					items,
				},
			}),
		);
	}
	if (manifest.managed.includes("albums"))
		for (const r of sorted.filter((r) => r.domain === "albums")) {
			if (!/^[\p{L}\p{N}_-]+$/u.test(r.data.key))
				throw new Error("相册标识只允许字母、数字、短横线和下划线");
			const target = `public/images/albums/${r.data.key}/info.json`;
			output(
				target,
				active(r)
					? JSON.stringify(
							{
								...mapAssets(cleanData(r), r.path),
								order: r.data.order ?? 0,
								mode: "external",
								cover: asset(r.data.cover || r.data.photos?.[0]?.src || "",r.path),
								columns: r.data.columns || 3,
								layout: r.data.layout || "masonry",
								photos: mapAssets(r.data.photos || [], r.path),
							},
							null,
							2,
						) + "\n"
					: null,
			);
		}
	if (!dryRun) {
		// These are generated build inputs. Never mutate the original Vault.
		for (const folder of ["src/content", "public/images/vault", "public/images/albums"]) rmSync(safe(root, folder), {recursive:true, force:true});
		for (const collection of ["posts","moments","spec"]) mkdirSync(join(root,"src/content",collection), {recursive:true});
    for (const folder of ["public/images/vault","public/images/albums"]) mkdirSync(join(root,folder), {recursive:true});
		rmSync(configRoot, { recursive: true, force: true });
		const previousPath = join(root, ".vault-cache-files.json");
		const previous = existsSync(previousPath)
			? JSON.parse(readFileSync(previousPath, "utf8"))
			: [];
		const next = [...outputs.keys(), ...assetOutputs.values()];
		for (const p of previous)
			if (!next.includes(p)) rmSync(safe(root, p), { force: true });
		for (const [p, text] of outputs) {
			const dest = safe(root, p);
			if (text === null) rmSync(dest, { force: true });
			else write(dest, text);
		}
    for (const [original,target] of assetOutputs) {
      const dest = safe(root,target);
      mkdirSync(dirname(dest), {recursive:true});
      copyFileSync(safe(sourceRoot,original),dest);
    }
		write(previousPath, JSON.stringify(next) + "\n");
		const generated = [...outputs.keys()]
			.filter(
				(p) => p.startsWith("src/data/") || p === "src/user/vault-data.json",
			)
			.map((p) => safe(root, p));
		const biome = join(root, "node_modules/@biomejs/biome/bin/biome");
		if (generated.length && existsSync(biome))
			execFileSync(
				process.execPath,
				[biome, "check", "--write", ...generated],
				{ cwd: root, stdio: "pipe", windowsHide: true },
			);
	}
	return { configRoot, records: records.length, time, outputs };
}
