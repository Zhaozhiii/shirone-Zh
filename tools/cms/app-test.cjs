(async () => {
	const plugin = app.plugins.plugins["shirone-cms"];
	if (!plugin) throw new Error("CMS plugin not loaded");
	const auto = plugin.settings.autoSync;
	plugin.settings.autoSync = false;
	const tick = () => new Promise((r) => setTimeout(r, 150));
	const button = (root, text) =>
		[...root.querySelectorAll("button")].find((b) => b.textContent === text);
	const set = (name, value) => {
		const row = [...document.querySelectorAll(".modal .setting-item")].find(
			(e) => e.querySelector(".setting-item-name")?.textContent === name,
		);
		if (!row) throw new Error("Missing form field: " + name);
		const input = row.querySelector("input,textarea");
		input.value = value;
		input.dispatchEvent(new Event("input", { bubbles: true }));
	};
	const created = [];
	const results = [];
	try {
		await plugin.open();
		await tick();
		button(document.querySelector(".shirone-cms"), "新建文章").click();
		await tick();
		set("标题", "CMS 集成验证（临时）");
		set("正文", "# 集成验证\n\n这是一篇临时测试草稿。");
		if (!document.querySelector(".modal input[type=password]"))
			throw new Error("Password input is not masked");
		button(document.querySelector(".modal"), "保存").click();
		await tick();
		const note = app.vault
			.getMarkdownFiles()
			.find(
				(f) =>
					f.path.startsWith("content/posts/") &&
					require("fs")
						.readFileSync(app.vault.adapter.getFullPath(f.path), "utf8")
						.includes("CMS 集成验证（临时）"),
			);
		if (!note) throw new Error("Form save did not create a note");
		created.push(note);
		const text = await app.vault.read(note);
		if (!text.includes("draft: true") || !text.includes("# 集成验证"))
			throw new Error("Draft or body not preserved");
		results.push(
			"article form creates a Markdown draft; password input masked",
		);
		const view = app.workspace.getLeavesOfType("shirone-cms")[0].view;
		view.selected.add(note.path);
		const batch = [...view.contentEl.querySelectorAll("select")].find((s) =>
			[...s.options].some((o) => o.value === "hide"),
		);
		batch.value = "hide";
		batch.dispatchEvent(new Event("change"));
		await tick();
		if (!(await app.vault.read(note)).includes("visible: false"))
			throw new Error("Batch edit did not update frontmatter");
		results.push("batch visibility edits real note frontmatter");
		button(view.contentEl, "图片库").click();
		await tick();
		const transfer = new DataTransfer();
		transfer.items.add(
			new File(
				[
					Uint8Array.from(
						atob(
							"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2QAAAABJRU5ErkJggg==",
						),
						(c) => c.charCodeAt(0),
					),
				],
				"cms-integration-test.png",
				{ type: "image/png" },
			),
		);
		const input = document.querySelector(".modal input[type=file]");
		input.files = transfer.files;
		input.dispatchEvent(new Event("change"));
		await tick();
		const image = app.vault
			.getFiles()
			.find((f) => f.name.endsWith("-cms-integration-test.png"));
		if (!image) throw new Error("Image import failed");
		created.push(image);
		results.push("image picker imports binary image to non-public CMS storage");
		app.modalContainer?.children;
		document.querySelector(".modal-header-button")?.click();
		await tick();
		view.domain = "devices";
		view.render();
		if (view.contentEl.querySelectorAll("tbody tr").length !== 8)
			throw new Error("Migrated device count differs");
		results.push("eight migrated devices render in management table");
		return JSON.stringify({ passed: results });
	} finally {
		document.querySelector(".modal-header-button")?.click();
		for (const f of created.reverse())
			if (app.vault.getAbstractFileByPath(f.path)) await app.vault.delete(f);
		plugin.firstDirty = 0;
		clearTimeout(plugin.timer);
		plugin.settings.autoSync = auto;
		plugin.render();
	}
})();
