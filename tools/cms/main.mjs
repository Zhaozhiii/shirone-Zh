import {
	Plugin,
	ItemView,
	Modal,
	Notice,
	Setting,
	requestUrl,
	normalizePath,
} from "obsidian";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { parse, stringify, parseDocument } from "yaml";
import {
	domains,
	commonFields,
	folderFor,
	domainFor,
	labels,
} from "./model.mjs";
import {
	readRecords,
	readNote,
	noteText,
	refreshState,
	validate,
	compileCms,
} from "./core.mjs";
import schema from "./settings-schema.json" with { type: "json" };
import { rebaseWithClock } from "./git-sync.mjs";

const execute = promisify(execFile),
	VIEW = "shirone-cms";
const names = {
	true: "是",
	false: "否",
	movie: "电影",
	book: "书籍",
	planned: "计划中",
	"in-progress": "进行中",
	completed: "已完成",
	active: "在用",
	backup: "备用",
	archived: "已归档",
	wishlist: "愿望清单",
	shipped: "已发布",
	building: "开发中",
	exploring: "探索中",
	beginner: "入门",
	intermediate: "熟悉",
	advanced: "熟练",
	expert: "精通",
	watching: "在看",
	onHold: "搁置",
	dropped: "弃坑",
};
const fieldLabels = {
	title: "标题",
	name: "名称",
	enable: "启用",
	text: "文字",
	url: "网址",
	href: "链接",
	link: "链接",
	icon: "图标",
	image: "图片",
	cover: "封面",
	description: "描述",
	label: "名称",
	key: "标识",
	content: "正文",
	type: "类型",
	items: "条目",
	links: "链接",
	children: "子项",
	preset: "内置页面",
	pages: "页面开关",
	home: "首页",
	media: "电影书籍",
	anime: "追番",
	series: "系列",
	compass: "网址导航",
	skills: "技能",
	timeline: "时间线",
	devices: "设备",
	friends: "友链",
	projects: "项目",
	albums: "相册",
	about: "关于",
	sponsor: "打赏",
	categories: "分类",
	tags: "标签",
	moments: "动态",
	guestbook: "留言板",
	rss: "RSS",
	atom: "Atom",
	external: "新窗口打开",
	slot: "停靠位置",
	column: "所在列",
	side: "侧栏位置",
	components: "组件",
	arrangement: "栏数",
	position: "位置",
	color: "颜色",
	size: "尺寸",
	width: "宽度",
	height: "高度",
	mode: "模式",
	style: "样式",
	background: "背景",
	avatar: "头像",
	bio: "简介",
	social: "社交链接",
	order: "排序",
	provider: "数据源",
	source: "来源",
	language: "语言",
	timeZone: "时区",
	subtitle: "副标题",
	banner: "横幅",
	homeText: "首页文字",
	footer: "页脚",
	nav: "导航",
	password: "密码",
	passwordHint: "密码提示",
	depth: "深度",
	count: "数量",
	limit: "数量上限",
	font: "字体",
	family: "字体",
	weight: "字重",
	blur: "模糊",
	opacity: "透明度",
	duration: "持续时间",
	interval: "间隔",
	closable: "允许关闭",
	date: "日期",
	rating: "评分",
	author: "作者",
	creator: "作者 / 导演",
	src: "图片路径",
	alt: "图片说明",
	note: "说明",
	blurb: "分组介绍",
	brand: "品牌",
	status: "状态",
	specs: "规格",
	summary: "摘要",
	category: "分类",
	featured: "推荐",
	phase: "阶段",
	technologies: "技术",
	year: "年份",
	repository: "仓库",
	website: "项目网站",
	specDetails: "详细规格",
	value: "值",
	tag: "标签",
	tagline: "签名",
	id: "编号",
	platform: "平台",
	handle: "账号",
	genres: "题材",
	progress: "进度",
	watched: "已看",
	total: "总数",
	start: "开始",
	end: "结束",
	heading: "标题",
	disabledIds: "禁用条目编号",
	disabledKeys: "禁用条目标识",
	disabledNames: "禁用名称",
	disabledTitles: "禁用标题",
};
const clone = (x) => JSON.parse(JSON.stringify(x));
function merge(a, b) {
	if (Array.isArray(b) || !b || typeof b !== "object") return b ?? a;
	const out = { ...(a || {}) };
	for (const [k, v] of Object.entries(b)) out[k] = merge(a?.[k], v);
	return out;
}
function title(r) {
	return (
		r.data.title ||
		r.data.name ||
		r.data.label ||
		r.data.platform ||
		basename(r.path, ".md")
	);
}
function inferred(v) {
	return {
		type: Array.isArray(v)
			? "array"
			: typeof v === "object" && v !== null
				? "object"
				: typeof v,
	};
}
function label(k, s) {
	return fieldLabels[k] || s?.label || k;
}

/** A structured editor; nested arrays never require hand-written JSON or YAML. */
function valueEditor(parent, key, value, s, changed) {
	s = s || inferred(value);
	const type = s.type || inferred(value).type;
	if (type === "object") {
		const details = parent.createEl("details", { cls: "cms-object" });
		details.createEl("summary", { text: label(key, s) });
		const current = clone(value || {});
		const fields = {
			...Object.fromEntries(
				Object.keys(current).map((k) => [k, inferred(current[k])]),
			),
			...s.properties,
		};
		for (const [k, child] of Object.entries(fields))
			valueEditor(details, k, current[k], child, (v) => {
				if (v === undefined) delete current[k];
				else current[k] = v;
				changed(clone(current));
			});
		const add = details.createEl("button", { text: "添加属性" });
		add.onclick = () =>
			new TextPrompt(parent.win?.app || window.app, "属性名", (name) => {
				if (name) {
					current[name] = "";
					changed(current);
					details.empty();
					details.createEl("summary", { text: label(key, s) });
					valueEditor(details, key, current, { type: "object" }, changed);
				}
			}).open();
		return;
	}
	if (type === "array") {
		const details = parent.createEl("details", { cls: "cms-array" });
		details.createEl("summary", {
			text: `${label(key, s)}（${(value || []).length} 项）`,
		});
		const current = clone(value || []),
			list = details.createDiv();
		function render() {
			list.empty();
			current.forEach((v, i) => {
				const box = list.createDiv({ cls: "cms-array-item" });
				valueEditor(box, String(i + 1), v, s.items || inferred(v), (x) => {
					current[i] = x;
					changed(clone(current));
				});
				const controls = box.createDiv({ cls: "cms-actions" });
				for (const [text, act] of [
					[
						"↑",
						() => {
							if (i)
								[current[i - 1], current[i]] = [current[i], current[i - 1]];
						},
					],
					[
						"↓",
						() => {
							if (i < current.length - 1)
								[current[i + 1], current[i]] = [current[i], current[i + 1]];
						},
					],
					["移除", () => current.splice(i, 1)],
				]) {
					const b = controls.createEl("button", { text });
					b.onclick = () => {
						act();
						changed(clone(current));
						render();
					};
				}
			});
		}
		const b = details.createEl("button", { text: "添加条目" });
		b.onclick = () => {
			current.push(
				s.items?.type === "object" ? {} : s.items?.type === "number" ? 0 : "",
			);
			changed(clone(current));
			render();
		};
		render();
		return;
	}
	const setting = new Setting(parent).setName(label(key, s));
	if (s.description) setting.setDesc(s.description);
	if (s.enum?.length) {
		setting.addDropdown((d) => {
			d.addOption("", "未设置");
			for (const v of s.enum) d.addOption(String(v), names[v] || String(v));
			d.setValue(value === undefined ? "" : String(value)).onChange((v) =>
				changed(v === "" ? undefined : s.enum.find((x) => String(x) === v)),
			);
		});
	} else if (type === "boolean")
		setting.addToggle((t) => t.setValue(value === true).onChange(changed));
	else if (type === "number")
		setting.addText(
			(t) =>
				(t
					.setValue(value === undefined ? "" : String(value))
					.onChange((v) =>
						changed(v === "" ? undefined : Number(v)),
					).inputEl.type = "number"),
		);
	else if (type === "textarea")
		setting.addTextArea((t) => t.setValue(value || "").onChange(changed));
	else
		setting.addText((t) => {
			const initial =
				type === "datetime-local" && value
					? new Intl.DateTimeFormat("sv-SE", {
							timeZone: "Asia/Shanghai",
							year: "numeric",
							month: "2-digit",
							day: "2-digit",
							hour: "2-digit",
							minute: "2-digit",
							hourCycle: "h23",
						})
							.format(
								new Date(
									value.match(/(?:Z|[+-]\d\d:\d\d)$/)
										? value
										: value + "+08:00",
								),
							)
							.replace(" ", "T")
					: value;
			t.setValue(initial === undefined ? "" : String(initial)).onChange(
				changed,
			);
			t.inputEl.type = ["password", "date", "datetime-local", "url"].includes(
				type,
			)
				? type
				: "text";
		});
}
class TextPrompt extends Modal {
	constructor(app, text, done) {
		super(app);
		this.text = text;
		this.done = done;
	}
	onOpen() {
		this.contentEl.createEl("h2", { text: this.text });
		let value = "";
		new Setting(this.contentEl).addText((t) => t.onChange((v) => (value = v)));
		new Setting(this.contentEl).addButton((b) =>
			b
				.setButtonText("确定")
				.setCta()
				.onClick(() => {
					this.close();
					this.done(value);
				}),
		);
	}
}

class RecordForm extends Modal {
	constructor(plugin, domain, record) {
		super(plugin.app);
		this.plugin = plugin;
		this.domain = domain;
		this.record = record;
	}
	async onOpen() {
		const def = domains[this.domain];
		this.contentEl.createEl("h2", {
			text: (this.record ? "编辑" : "新建") + def.label,
		});
		const data = clone(
			this.record?.data || {
				cmsId: randomUUID(),
				draft: true,
				visible: true,
				order: 0,
			},
		);
		if (!this.record) {
			if (def.fields.published)
				data.published = new Intl.DateTimeFormat("en-CA", {
					timeZone: "Asia/Shanghai",
				}).format(new Date());
			if (def.fields.key) data.key = randomUUID().slice(0, 8);
			if (this.domain === "friends") data.id = Date.now();
			if (this.domain === "albums") {
				data.layout = "masonry";
				data.columns = 3;
				data.photos = [];
			}
		}
		const records = readRecords(this.plugin.root);
		for (const [key, [name, type, required, options]] of Object.entries({
			...def.fields,
			...commonFields,
		})) {
			if (key === "title" && !def.fields.title && this.domain !== "posts")
				continue;
			if (type === "category" || type === "series" || type === "tags") {
				const setting = new Setting(this.contentEl).setName(name);
				const candidates = records.filter(
					(r) =>
						r.domain ===
						(type === "category"
							? "categories"
							: type === "series"
								? "series"
								: "tags"),
				);
				if (type === "tags")
					setting.addText((t) =>
						t
							.setPlaceholder("逗号分隔，可直接填写")
							.setValue((data[key] || []).join(", "))
							.onChange(
								(v) =>
									(data[key] = v
										.split(/[,，]/)
										.map((x) => x.trim())
										.filter(Boolean)),
							),
					);
				else
					setting.addDropdown((d) => {
						d.addOption("", "未设置");
						if (data[key] && !candidates.some((r) => r.data.key === data[key]))
							d.addOption(data[key], data[key]);
						for (const r of candidates.filter(
							(r) => r.data.key !== data.key || key !== "parent",
						))
							d.addOption(r.data.key, title(r));
						d.setValue(data[key] || "").onChange((v) => (data[key] = v));
					});
				continue;
			}
			if (type === "image") {
				const setting = new Setting(this.contentEl)
					.setName(name)
					.addText((t) =>
						t.setValue(data[key] || "").onChange((v) => (data[key] = v)),
					);
				setting.addButton((b) =>
					b.setButtonText("选择图片").onClick(() =>
						new ImagePicker(this.plugin, (p) => {
							data[key] = p;
							this.record = { ...this.record, data };
							this.contentEl.empty();
							this.onOpen();
						}).open(),
					),
				);
				continue;
			}
			const arrayTypes = {
				images: { src: { type: "string" }, alt: { type: "string" } },
				photos: {
					src: { type: "string" },
					alt: { type: "string" },
					title: { type: "string" },
					tags: { type: "array", items: { type: "string" } },
				},
				links: {
					label: { type: "string" },
					href: { type: "string" },
					note: { type: "string" },
					icon: { type: "string" },
					image: { type: "string" },
				},
				specs: {
					key: { type: "string" },
					label: { type: "string" },
					value: { type: "string" },
				},
			};
			const s =
				type === "select"
					? { type: "string", enum: options }
					: arrayTypes[type]
						? {
								type: "array",
								items: { type: "object", properties: arrayTypes[type] },
							}
						: type === "objects"
							? { type: "array", items: { type: "object" } }
							: type === "object"
								? { type: "object" }
								: { type: type === "datetime" ? "datetime-local" : type };
			s.label = name;
			valueEditor(this.contentEl, key, data[key], s, (v) => {
				data[key] = v;
				if (this.domain === "posts" && key === "password" && v)
					data.encrypted = true;
				if (this.domain === "posts" && key === "encrypted" && v === false) {
					delete data.password;
					const input = this.contentEl.querySelector("input[type=password]");
					if (input) input.value = "";
				}
			});
			if (this.record?.path && ["key", "id"].includes(key)) {
				const input = this.contentEl.lastElementChild?.querySelector("input");
				if (input) input.readOnly = true;
			}
			if (required)
				this.contentEl.lastElementChild?.classList.add("cms-required");
		}
		// Unknown legacy fields are retained and editable instead of discarded by a form save.
		const unknown = Object.fromEntries(
			Object.entries(data).filter(
				([k]) => k !== "cmsId" && !def.fields[k] && !commonFields[k],
			),
		);
		if (Object.keys(unknown).length)
			valueEditor(
				this.contentEl,
				"其他属性",
				unknown,
				{ type: "object" },
				(v) => Object.assign(data, v),
			);
		let body = this.record?.body || "";
		if (def.folder)
			new Setting(this.contentEl)
				.setName("正文")
				.setDesc("可在这里简写；保存后用 Obsidian 正文编辑器继续写作。")
				.addTextArea(
					(t) =>
						(t.setValue(body).onChange((v) => (body = v)).inputEl.rows = 8),
				);
		const error = this.contentEl.createDiv({ cls: "cms-error" });
		const save = async (publish) => {
			try {
				if (publish) data.draft = false;
				const id = data.cmsId || randomUUID();
				data.cmsId = id;
				const path = this.record?.path || `${folderFor(this.domain)}/${id}.md`;
				const candidate = { domain: this.domain, path, data, body };
				validate([
					...readRecords(this.plugin.root).filter((r) => r.path !== path),
					candidate,
				]);
				if (!existsSync(join(this.plugin.root, folderFor(this.domain))))
					await this.app.vault.createFolder(folderFor(this.domain));
				const existing = this.app.vault.getAbstractFileByPath(path);
				if (existing)
					await this.app.vault.modify(existing, noteText(data, body));
				else await this.app.vault.create(path, noteText(data, body));
				this.close();
				this.plugin.render();
				if (publish) await this.plugin.sync();
			} catch (e) {
				error.setText(e.message);
			}
		};
		new Setting(this.contentEl)
			.addButton((b) =>
				b
					.setButtonText("保存")
					.setCta()
					.onClick(() => save(false)),
			)
			.addButton((b) => b.setButtonText("发布").onClick(() => save(true)));
	}
}
class ImagePicker extends Modal {
	constructor(plugin, choose) {
		super(plugin.app);
		this.plugin = plugin;
		this.choose = choose;
	}
	onOpen() {
		this.contentEl.createEl("h2", { text: "图片库" });
		this.contentEl.createEl("p", {
			text: "拖入或粘贴图片，也可以批量选择文件。",
		});
		const input = this.contentEl.createEl("input", {
			type: "file",
			attr: {
				accept:
					"image/png,image/jpeg,image/webp,image/avif,image/gif,image/svg+xml",
				multiple: "true",
			},
		});
		const upload = async (list) => {
			for (const f of list) {
				if (!/\.(png|jpe?g|webp|avif|gif|svg)$/i.test(f.name)) continue;
				const dir = "cms/media";
				if (!existsSync(join(this.plugin.root, dir)))
					await this.app.vault.createFolder(dir);
				const p = `${dir}/${randomUUID()}-${f.name.replace(/[^\p{L}\p{N}._-]/gu, "_")}`;
				await this.app.vault.createBinary(p, await f.arrayBuffer());
			}
			this.contentEl.empty();
			this.onOpen();
		};
		input.onchange = () => upload(input.files);
		this.contentEl.ondragover = (e) => e.preventDefault();
		this.contentEl.ondrop = (e) => {
			e.preventDefault();
			upload(e.dataTransfer.files);
		};
		this.contentEl.onpaste = (e) => {
			if (e.clipboardData.files.length) {
				e.preventDefault();
				upload(e.clipboardData.files);
			}
		};
		const list = this.contentEl.createDiv({ cls: "cms-image-grid" });
		for (const file of this.app.vault
			.getFiles()
			.filter(
				(f) =>
					f.path.startsWith("cms/media/") &&
					/\.(png|jpe?g|webp|avif|gif|svg)$/i.test(f.path),
			)) {
			const box = list.createDiv({ cls: "cms-image" });
			box.createEl("img", {
				attr: {
					src: this.app.vault.getResourcePath(file),
					alt: file.basename,
					loading: "lazy",
				},
			});
			box.createEl("small", { text: file.name });
			const select = box.createEl("button", { text: "选择" });
			select.onclick = () => {
				this.choose(file.path);
				this.close();
			};
			const refs = readRecords(this.plugin.root).filter(
				(r) =>
					JSON.stringify(r.data).includes(file.path) ||
					r.body.includes(file.path) ||
					r.body.includes(file.name),
			);
			box.createEl("small", { text: `被 ${refs.length} 个条目引用` });
			const del = box.createEl("button", { text: "移入回收站" });
			del.disabled = refs.length > 0;
			del.onclick = async () => {
				await this.app.fileManager.trashFile(file);
				box.remove();
			};
		}
	}
}
class SettingsForm extends Modal {
	constructor(plugin, domain) {
		super(plugin.app);
		this.plugin = plugin;
		this.domain = domain;
	}
	onOpen() {
		const file = join(this.plugin.root, `config/${this.domain}.yaml`),
			original = existsSync(file) ? readFileSync(file, "utf8") : "";
		const overrides = parse(original) || {},
			def = schema[this.domain] || {},
			draft = merge(def.defaults, overrides);
		this.contentEl.createEl("h2", { text: labels[this.domain] || this.domain });
		this.contentEl.createEl("p", {
			text: "仅保存你修改的字段；未覆盖的值继续继承主题默认设置。",
		});
		const changes = new Map();
		const props =
			def.schema?.properties ||
			Object.fromEntries(
				Object.keys(draft || {}).map((k) => [k, inferred(draft[k])]),
			);
		// Each top-level control computes a minimal difference against its default subtree.
		function diff(base, value) {
			if (JSON.stringify(base) === JSON.stringify(value)) return undefined;
			if (value && typeof value === "object" && !Array.isArray(value)) {
				const out = {};
				for (const [k, v] of Object.entries(value)) {
					const d = diff(base?.[k], v);
					if (d !== undefined) out[k] = d;
				}
				return Object.keys(out).length ? out : undefined;
			}
			return value;
		}
		if (Array.isArray(draft))
			valueEditor(
				this.contentEl,
				"导航链接",
				draft,
				{
					type: "array",
					items: {
						type: "object",
						properties: {
							preset: {
								type: "string",
								enum: [
									"Home",
									"Archive",
									"Categories",
									"Tags",
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
									"Media",
									"Guestbook",
									"Sponsor",
									"RSS",
									"Atom",
								],
							},
							name: { type: "string" },
							url: { type: "string" },
							icon: { type: "string" },
							external: { type: "boolean" },
							children: {
								type: "array",
								items: {
									type: "object",
									properties: {
										name: { type: "string" },
										url: { type: "string" },
										preset: { type: "string" },
									},
								},
							},
						},
					},
				},
				(v) => changes.set("$", v),
			);
		else
			for (const [k, s] of Object.entries({
				...Object.fromEntries(
					Object.keys(draft || {}).map((k) => [k, inferred(draft[k])]),
				),
				...props,
			})) {
				const row = this.contentEl.createDiv();
				valueEditor(row, k, draft?.[k], s, (v) =>
					changes.set(k, diff(def.defaults?.[k], v)),
				);
				const reset = row.createEl("button", {
					text: "恢复继承",
					cls: "cms-reset",
				});
				reset.onclick = () => {
					changes.set(k, undefined);
					row.classList.add("cms-inherited");
					new Notice("保存后恢复主题默认值");
				};
			}
		const error = this.contentEl.createDiv({ cls: "cms-error" });
		new Setting(this.contentEl).addButton((b) =>
			b
				.setButtonText("保存设置")
				.setCta()
				.onClick(async () => {
					try {
						const doc = parseDocument(original || "{}");
						if (changes.has("$"))
							doc.contents = doc.createNode(changes.get("$"));
						else
							for (const [k, v] of changes) {
								if (v === undefined) doc.delete(k);
								else doc.set(k, v);
							}
						const path = `config/${this.domain}.yaml`;
						const existing = this.app.vault.getAbstractFileByPath(path);
						if (existing)
							await this.app.vault.modify(
								existing,
								doc.toString({ lineWidth: 0 }),
							);
						else
							await this.app.vault.create(path, doc.toString({ lineWidth: 0 }));
						this.close();
						this.plugin.render();
					} catch (e) {
						error.setText(e.message);
					}
				}),
		);
	}
}

class CmsView extends ItemView {
	constructor(leaf, plugin) {
		super(leaf);
		this.plugin = plugin;
		this.domain = "posts";
		this.selected = new Set();
	}
	getViewType() {
		return VIEW;
	}
	getDisplayText() {
		return "Shirone CMS";
	}
	getIcon() {
		return "panels-top-left";
	}
	async onOpen() {
		this.render();
	}
	render() {
		const el = this.contentEl;
		el.empty();
		el.addClass("shirone-cms");
		el.createEl("h1", { text: "博客管理" });
		el.createEl("p", { text: this.plugin.status, cls: "cms-status" });
		const actions = el.createDiv({ cls: "cms-actions" });
		for (const [text, act] of [
			["立即同步", () => this.plugin.sync()],
			["预览", () => this.plugin.preview()],
			[
				"指定时间预览",
				() =>
					new TextPrompt(this.app, "预览时间，例如 2026-10-24T18:00", (v) =>
						this.plugin.preview(v),
					).open(),
			],
			["检查发布状态", () => this.plugin.checkStatus()],
			[
				"恢复同步",
				() => {
					this.plugin.paused = false;
					this.plugin.sync();
				},
			],
			[
				"图片库",
				() =>
					new ImagePicker(this.plugin, (p) => {
						navigator.clipboard.writeText(p);
						new Notice("图片路径已复制，可在表单中选择封面或插入正文");
					}).open(),
			],
		]) {
			const b = actions.createEl("button", { text });
			b.onclick = () =>
				Promise.resolve(act()).catch((e) => this.plugin.fail(e));
		}
		const nav = el.createDiv({ cls: "cms-nav" });
		for (const [d, def] of Object.entries(domains)) {
			const b = nav.createEl("button", {
				text: def.label,
				cls: d === this.domain ? "mod-cta" : "",
			});
			b.onclick = () => {
				this.domain = d;
				this.selected.clear();
				this.render();
			};
		}
		const settings = el.createEl("details");
		settings.createEl("summary", { text: "网站设置" });
		const settingsButtons = settings.createDiv({ cls: "cms-nav" });
		for (const d of Object.keys(schema)) {
			const b = settingsButtons.createEl("button", { text: labels[d] || d });
			b.onclick = () => new SettingsForm(this.plugin, d).open();
		}
		const footer = settingsButtons.createEl("button", {
			text: "自定义页脚 HTML",
		});
		footer.onclick = async () => {
			const path = "config/footer.html";
			const file = this.app.vault.getAbstractFileByPath(path);
			let value = file ? await this.app.vault.read(file) : "";
			const modal = new Modal(this.app);
			modal.contentEl.createEl("h2", { text: "自定义页脚 HTML" });
			new Setting(modal.contentEl)
				.setName("页脚内容")
				.setDesc("需在“页脚”设置中启用自定义页脚。")
				.addTextArea((t) => {
					t.setValue(value).onChange((v) => (value = v));
					t.inputEl.rows = 12;
				});
			new Setting(modal.contentEl).addButton((b) =>
				b
					.setButtonText("保存")
					.setCta()
					.onClick(async () => {
						if (file) await this.app.vault.modify(file, value);
						else await this.app.vault.create(path, value);
						modal.close();
					}),
			);
			modal.open();
		};
		const about = settingsButtons.createEl("button", { text: "关于页正文" });
		about.onclick = async () => {
			const f = this.app.vault.getAbstractFileByPath("content/spec/about.md");
			if (f) await this.app.workspace.getLeaf(true).openFile(f);
		};
		const music = settingsButtons.createEl("button", {
			text: "音乐自动同步状态",
		});
		music.onclick = () =>
			window.open(
				"https://github.com/Zhaozhiii/Shirone-Zh-CMS/actions/workflows/sync-music.yml",
			);
		const def = domains[this.domain];
		el.createEl("h2", { text: def.label });
		const bar = el.createDiv({ cls: "cms-actions" });
		const add = bar.createEl("button", {
			text: "新建" + def.label,
			cls: "mod-cta",
		});
		add.onclick = () => new RecordForm(this.plugin, this.domain).open();
		for (const [type, text] of [
			["表格", "原生表格"],
			["卡片", "原生卡片"],
		]) {
			const b = bar.createEl("button", { text });
			b.onclick = async () => {
				const f = this.app.vault.getAbstractFileByPath(
					`管理面板/${def.label}.base`,
				);
				await this.app.workspace.getLeaf(true).openFile(f);
			};
		}
		const search = bar.createEl("input", {
			type: "search",
			placeholder: "搜索标题和标签",
		});
		let query = "";
		const filter = bar.createEl("select");
		for (const [value, text] of [
			["all", "全部"],
			["draft", "草稿"],
			["published", "已发布"],
			["scheduled", "待发布"],
			["hidden", "隐藏"],
		])
			filter.createEl("option", { value, text });
		const batch = bar.createEl("select");
		for (const [v, text] of [
			["", "批量操作"],
			["draft", "转为草稿"],
			["publish", "发布"],
			["hide", "隐藏"],
			["show", "显示"],
			["category", "修改分类"],
			["tags", "修改标签"],
			["order", "设置排序"],
			["trash", "移入回收站"],
		])
			batch.createEl("option", { value: v, text });
		batch.onchange = async () => {
			const action = batch.value;
			batch.value = "";
			if (!action || !this.selected.size) return;
			const apply = async (value) => {
				try {
					for (const path of this.selected) {
						const f = this.app.vault.getAbstractFileByPath(path);
						if (action === "trash") {
							await this.app.fileManager.trashFile(f);
							continue;
						}
						await this.app.fileManager.processFrontMatter(f, (data) => {
							if (action === "category") data.category = value;
							if (action === "tags")
								data.tags = value
									.split(/[,，]/)
									.map((s) => s.trim())
									.filter(Boolean);
							if (action === "order") data.order = Number(value);
							if (["draft", "publish"].includes(action))
								data.draft = action === "draft";
							if (["hide", "show"].includes(action))
								data.visible = action === "show";
						});
					}
					this.selected.clear();
					this.render();
				} catch (e) {
					this.plugin.fail(e);
				}
			};
			if (["category", "tags", "order"].includes(action))
				new TextPrompt(
					this.app,
					{
						category: "分类稳定标识",
						tags: "标签（逗号分隔）",
						order: "排序值",
					}[action],
					apply,
				).open();
			else await apply("");
		};
		const list = el.createDiv();
		const renderList = () => {
			list.empty();
			const table = list.createEl("table", { cls: "cms-table" });
			const head = table.createEl("thead").createEl("tr");
			for (const h of ["选择", "名称", "状态", "排序", "操作"])
				head.createEl("th", { text: h });
			const body = table.createEl("tbody");
			const records = readRecords(this.plugin.root)
				.filter((r) => r.domain === this.domain)
				.sort((a, b) => (a.data.order || 0) - (b.data.order || 0));
			for (const r of records) {
				if (
					query &&
					!`${title(r)} ${(r.data.tags || []).join(" ")}`
						.toLowerCase()
						.includes(query.toLowerCase())
				)
					continue;
				const status = r.data.draft
					? "草稿"
					: r.data.visible === false
						? "隐藏"
						: r.data.publishAt && new Date(r.data.publishAt) > new Date()
							? "待发布"
							: r.data.unpublishAt && new Date(r.data.unpublishAt) <= new Date()
								? "已下线"
								: "已发布";
				if (
					filter.value !== "all" &&
					!(
						{
							draft: "草稿",
							published: "已发布",
							scheduled: "待发布",
							hidden: "隐藏",
						}[filter.value] === status
					)
				)
					continue;
				const row = body.createEl("tr");
				const check = row
					.createEl("td")
					.createEl("input", { type: "checkbox" });
				check.checked = this.selected.has(r.path);
				check.onchange = () =>
					check.checked
						? this.selected.add(r.path)
						: this.selected.delete(r.path);
				row.createEl("td", { text: title(r) });
				row.createEl("td", { text: status });
				row.createEl("td", { text: String(r.data.order || 0) });
				const controls = row.createEl("td");
				const edit = controls.createEl("button", { text: "编辑" });
				edit.onclick = () => new RecordForm(this.plugin, this.domain, r).open();
				const open = controls.createEl("button", { text: "正文" });
				open.onclick = () =>
					this.app.workspace
						.getLeaf(true)
						.openFile(this.app.vault.getAbstractFileByPath(r.path));
			}
			if (!records.length)
				list.createEl("p", { text: "还没有条目，点击“新建”开始。" });
		};
		search.oninput = () => {
			query = search.value;
			renderList();
		};
		filter.onchange = renderList;
		renderList();
	}
}

export default class ShironeCms extends Plugin {
	async onload() {
		this.root = this.app.vault.adapter.getBasePath();
		this.settings = {
			themePath: resolve(this.root, "../shirone-Zh"),
			nodePath: "node",
			autoSync: true,
			...(await this.loadData()),
		};
		this.status = "就绪";
		this.paused = false;
		this.queue = Promise.resolve();
		this.firstDirty = 0;
		this.children = [];
		this.registerView(VIEW, (leaf) => new CmsView(leaf, this));
		this.addRibbonIcon("panels-top-left", "Shirone CMS", () => this.open());
		this.addCommand({
			id: "open",
			name: "打开博客管理",
			callback: () => this.open(),
		});
		this.addCommand({
			id: "sync",
			name: "立即同步和发布",
			callback: () => this.sync(),
		});
		this.addCommand({
			id: "preview",
			name: "预览网站（包含草稿）",
			callback: () => this.preview(),
		});
		this.statusEl = this.addStatusBarItem();
		this.setStatus("就绪");
		for (const event of ["create", "modify", "delete", "rename"])
			this.registerEvent(
				this.app.vault.on(event, (file) => {
					if (this.relevant(file.path)) this.dirty();
				}),
			);
		this.registerInterval(
			window.setInterval(() => {
				if (this.settings.autoSync && !this.paused) {
					if (this.firstDirty && Date.now() - this.firstDirty >= 300000)
						this.sync();
					else if (!this.firstDirty) this.pull();
				}
			}, 300000),
		);
		this.registerInterval(
			window.setInterval(() => {
				if (!this.busy && !this.firstDirty && /等待|构建中/.test(this.status))
					this.checkStatus();
			}, 30000),
		);
		this.app.workspace.onLayoutReady(() => {
			if (this.settings.autoSync) this.pull();
		});
		this.addSettingTab(new CmsSettings(this.app, this));
	}
	relevant(path) {
		return (
			/^(content|cms|config|data|assets|public)\//.test(path) &&
			path !== "cms/publication-state.json"
		);
	}
	setStatus(text) {
		this.status = text;
		this.statusEl?.setText("博客：" + text);
		this.render();
	}
	render() {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW))
			leaf.view.render();
	}
	async open() {
		let leaf = this.app.workspace.getLeavesOfType(VIEW)[0];
		if (!leaf) {
			leaf = this.app.workspace.getLeaf(true);
			await leaf.setViewState({ type: VIEW, active: true });
		}
		this.app.workspace.revealLeaf(leaf);
	}
	dirty() {
		if (this.busy) {
			this.dirtyDuringSync = true;
			return;
		}
		if (!this.firstDirty) this.firstDirty = Date.now();
		this.setStatus("未同步");
		clearTimeout(this.timer);
		if (this.settings.autoSync && !this.paused)
			this.timer = window.setTimeout(() => this.sync(), 60000);
	}
	async git(args) {
		return (
			await execute("git", args, {
				cwd: this.root,
				windowsHide: true,
				encoding: "utf8",
				maxBuffer: 8 * 1024 * 1024,
				env: {
					...process.env,
					GIT_TERMINAL_PROMPT: "0",
					GCM_INTERACTIVE: "never",
				},
			})
		).stdout.trim();
	}
	enqueue(fn) {
		const task = this.queue.then(fn);
		this.queue = task.catch(() => {});
		return task.catch((e) => this.fail(e));
	}
	fail(e) {
		this.setStatus(
			"失败：" + (e.publicMessage || e.message?.split("\n")[0] || "请检查连接"),
		);
		new Notice(this.status, 10000);
	}
	async pullRemote() {
		await this.git(["fetch", "origin", "main"]);
		const ahead = await this.git(["rev-list", "--count", "HEAD..origin/main"]);
		if (ahead !== "0") {
			try {
				await rebaseWithClock((args) => this.git(args), this.root);
			} catch {
				await this.git(["rebase", "--abort"]).catch(() => {});
				this.paused = true;
				throw new Error(
					"远端修改与本机冲突，已保留双方内容并暂停同步。请处理冲突后点“恢复同步”。",
				);
			}
		}
	}
	pull() {
		return this.enqueue(async () => {
			if (this.firstDirty || this.paused) return;
			const dirty = await this.git(["status", "--porcelain"]);
			if (dirty) {
				this.dirty();
				return;
			}
			this.busy = true;
			try {
				await this.pullRemote();
				await this.checkStatus();
			} finally {
				this.busy = false;
			}
		});
	}
	sync() {
		return this.enqueue(async () => {
			if (this.paused) throw new Error("同步已暂停，请处理冲突后恢复");
			clearTimeout(this.timer);
			this.busy = true;
			try {
				this.setStatus("校验内容");
				validate(readRecords(this.root));
				// Config type validation and full schema checking use the same compiler as CI.
				refreshState(this.root);
				await execute(
					this.settings.nodePath,
					[
						join(this.settings.themePath, "scripts/content/sync.mjs"),
						"--dry-run",
					],
					{
						cwd: this.settings.themePath,
						windowsHide: true,
						env: { ...process.env, CONTENT_DIR: this.root },
						maxBuffer: 16 * 1024 * 1024,
					},
				);
				const before = await this.git(["status", "--porcelain"]);
				if (before) {
					refreshState(this.root);
					await this.git(["add", "--all"]);
					const staged = await this.git(["diff", "--cached", "--name-only"]);
					if (staged)
						await this.git([
							"commit",
							"-m",
							"feat(content): update from Obsidian CMS",
						]);
				}
				this.setStatus("同步 GitHub");
				await this.pullRemote();
				await this.git(["push", "origin", "HEAD:main"]);
				this.firstDirty = 0;
				this.lastSha = await this.git(["rev-parse", "HEAD"]);
				this.setStatus("已同步，等待构建");
				await this.checkStatus();
			} catch (e) {
				if (e.stderr || e.stdout) {
					const dir = join(this.root, ".obsidian/plugins/shirone-cms");
					mkdirSync(dir, { recursive: true });
					writeFileSync(
						join(dir, "last-error.log"),
						`${e.stdout || ""}\n${e.stderr || ""}`,
					);
					e.publicMessage =
						"校验或同步失败，详细信息保存在本机 CMS last-error.log";
				}
				throw e;
			} finally {
				this.busy = false;
				if (this.dirtyDuringSync) {
					this.dirtyDuringSync = false;
					const remaining = await this.git(["status", "--porcelain"]).catch(
						() => "?",
					);
					if (remaining) this.dirty();
				}
			}
		});
	}
	async checkStatus() {
		try {
			const sha = this.lastSha || (await this.git(["rev-parse", "HEAD"]));
			const response = await requestUrl({
				url: `https://blog.zhiii.top/healthz?cms=${Date.now()}`,
				throw: false,
			});
			if (response.status !== 200) throw new Error("健康检查失败");
			if (response.json.content === sha) {
				this.setStatus("部署成功");
				return;
			}
			const token = await this.githubToken();
			if (token) {
				const runs = await requestUrl({
					url: `https://api.github.com/repos/Zhaozhiii/Shirone-Zh-CMS/actions/workflows/publish.yml/runs?per_page=5`,
					headers: {
						Authorization: `Bearer ${token}`,
						Accept: "application/vnd.github+json",
					},
					throw: false,
				});
				if (runs.status === 200) {
					const run = runs.json.workflow_runs.find((r) => r.head_sha === sha);
					if (run) {
						this.setStatus(
							run.status !== "completed"
								? "构建中"
								: run.conclusion === "success"
									? "已构建，等待部署确认"
									: "构建或部署失败（Actions 可查看详情）",
						);
						return;
					}
				}
			}
			this.setStatus("已同步，等待构建");
		} catch {
			if (!this.firstDirty) this.setStatus("暂时无法确认部署状态");
		}
	}
	async githubToken() {
		return new Promise((resolveToken) => {
			const child = execFile(
				"git",
				["credential", "fill"],
				{
					cwd: this.root,
					windowsHide: true,
					env: {
						...process.env,
						GIT_TERMINAL_PROMPT: "0",
						GCM_INTERACTIVE: "never",
					},
					timeout: 10000,
				},
				(err, out) =>
					resolveToken(
						err
							? null
							: out
									.split(/\r?\n/)
									.find((l) => l.startsWith("password="))
									?.slice(9),
					),
			);
			child.stdin.end("protocol=https\nhost=github.com\n\n");
		});
	}
	preview(at) {
		return this.enqueue(() => this.startPreview(at));
	}
	async startPreview(at) {
		if (this.children.length) {
			for (const child of this.children) child.kill();
			this.children = [];
		}
		const env = {
			...process.env,
			CONTENT_DIR: this.root,
			CMS_PREVIEW_AT: at || "",
		};
		const node =
			process.platform === "win32"
				? join(dirname(process.execPath), "node.exe")
				: process.execPath;
		// Electron's executable is not Node. Use the installed Node runtime on PATH.
		const launch = (args) => {
			const child = spawn(this.settings.nodePath, args, {
				cwd: this.settings.themePath,
				env,
				windowsHide: true,
				stdio: ["ignore", "pipe", "pipe"],
			});
			const log = join(this.root, ".obsidian/plugins/shirone-cms/preview.log");
			child.stdout.on("data", (b) => writeFileSync(log, b, { flag: "a" }));
			child.stderr.on("data", (b) => writeFileSync(log, b, { flag: "a" }));
			child.on("error", (e) => this.fail(e));
			this.children.push(child);
		};
		refreshState(this.root);
		await execute(this.settings.nodePath, ["scripts/content/sync.mjs"], {
			cwd: this.settings.themePath,
			env,
			windowsHide: true,
			maxBuffer: 16 * 1024 * 1024,
		});
		launch(["scripts/content/sync.mjs", "--watch"]);
		launch([
			"node_modules/astro/bin/astro.mjs",
			"dev",
			"--host",
			"127.0.0.1",
			"--port",
			"4381",
		]);
		new Notice("正在启动本机预览，几秒后打开");
		window.setTimeout(() => window.open("http://127.0.0.1:4381"), 3500);
	}
	onunload() {
		clearTimeout(this.timer);
		for (const c of this.children) c.kill();
	}
}
import { PluginSettingTab } from "obsidian";
class CmsSettings extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}
	display() {
		this.containerEl.empty();
		this.containerEl.createEl("h2", { text: "Shirone CMS" });
		new Setting(this.containerEl).setName("主题仓目录").addText((t) =>
			t.setValue(this.plugin.settings.themePath).onChange(async (v) => {
				this.plugin.settings.themePath = v;
				await this.plugin.saveData(this.plugin.settings);
			}),
		);
		new Setting(this.containerEl).setName("Node.js 24 路径").addText((t) =>
			t.setValue(this.plugin.settings.nodePath).onChange(async (v) => {
				this.plugin.settings.nodePath = v;
				await this.plugin.saveData(this.plugin.settings);
			}),
		);
		new Setting(this.containerEl)
			.setName("自动同步并发布")
			.setDesc("停止编辑 60 秒后同步；连续编辑最多每 5 分钟同步一次。")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.autoSync).onChange(async (v) => {
					this.plugin.settings.autoSync = v;
					await this.plugin.saveData(this.plugin.settings);
				}),
			);
	}
}
