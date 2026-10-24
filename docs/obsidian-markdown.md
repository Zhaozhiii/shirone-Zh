# Obsidian Markdown 兼容

兼容目标是 Obsidian 的原生语义和阅读行为。Shirone 继续拥有字体、配色、间距、动效和组件外观；不加载 Obsidian 主题 CSS，也不新增 Properties 面板。

## 作者语法

| 能力 | 支持与边界 |
| --- | --- |
| CommonMark / GFM | 标题、强调、删除线、转义、分割线、列表、任务、表格、自动链接、标准脚注；普通 Enter 为软换行，空行分段，双空格或反斜杠产生硬换行 |
| 行内扩展 | `==高亮==`、`~下标~`、`^上标^`、`^[行内脚注]`、GitHub Emoji shortcode、`#嵌套/标签`；代码、公式和 HTML 内不展开普通文本扩展 |
| 双链 | `[[笔记]]`、`[[笔记.md|别名]]`、`[[笔记#标题]]`、`[[笔记#标题#子标题]]`、`[[笔记#^block-id]]`、`[[#本页标题]]` |
| 嵌入 | `![[笔记]]`、章节、块和递归嵌入；章节包含子章节，截止于下一同级或更高级标题 |
| 附件 | 图片、音频、视频和 PDF；`![[图.png|300]]`、`![[图.png|300x200]]`、`![[文档.pdf#page=3&height=400]]`；媒体格式能否播放取决于浏览器编解码能力 |
| Callout | note、abstract/summary/tldr、info、todo、tip/hint、important、success/check/done、question/help/faq、warning/attention、caution、failure/fail/missing、danger/error、bug、example、quote/cite；自定义类型回退到 note 外观，`+`/`-` 控制初始折叠状态 |
| 公式 | 复用 KaTeX；支持 `$…$`、`$$…$$`、`\(...\)` 和 `\[...\]`；支持范围以 KaTeX 为准，MathJax 专属命令不保证兼容；错误保留可读内容并诊断 |
| 图表 | 复用 Mermaid；已覆盖流程、时序、类、状态、甘特、ER、饼图、旅程和思维导图；其他代码围栏保留代码，不请求外部图表服务 |
| Properties | 标题、日期、标签、封面等映射原有 UI；解析全部自定义 YAML 字段，不自动公开；`aliases` 用于查找，`cssclasses` 仅应用正文局部类名 |
| 注释与 HTML | `%%注释%%` 不进入 HTML、摘要、统计或附件收集；保留 HTML 支持，HTML 内不展开 Wiki 和其他文本扩展 |
| Obsidian URI | 显式 `obsidian://` 链接保留，由读者点击交给系统处理 |

`aliases` 是 Obsidian 的笔记别名列表；`alias` 是博客既有的网址字段，二者互不替代。完整示例位于 `tests/fixtures/obsidian-markdown.md`，不会作为博客文章自动发布。

## 引用解析与失效

显式相对路径相对于来源笔记，完整 Wiki 路径相对于 Vault 根目录；短名称优先同目录，再使用唯一文件名、路径后缀或别名。存在歧义时请写完整路径。中文、空格和 URL 编码均可使用，路径中的语法保留字符应使用编码或 Markdown 链接表达。

所有引用错误均不阻止发布：

- 私人、草稿、预约未到或已撤下内容：嵌入显示“暂未公开”，链接点击显示“未发布”，不输出可导航地址。
- 加密正文：不嵌入明文，显示保护提示和原文链接；原文沿用既有解密流程。
- 缺失、歧义、越界：对应引用显示局部提示，其他正文正常生成。越界检查发生在读取前。
- 循环和展开超限：仅停止对应分支；可公开的目标仍提供原文链接。默认上限为 16 层、每页 200 次嵌入。

未公开链接使用原生 Popover，支持鼠标、键盘和触屏，无需 JavaScript。RSS 使用文字状态。浏览器提示不额外公开私人路径、属性、正文或附件；作者主动写入公开正文的链接文字保留。

嵌入中的路径以来源笔记解析，标题、块、脚注和显式组件 ID 按实例隔离。反向链接只统计公开笔记的直接引用，不把递归展开重复计数。加密来源不进入公开反向链接列表。

## 实现接口

`siteMarkdownProcessor` 仍是默认入口；`createSiteMarkdownProcessor({ root, contentRoot })` 为 npm 和自定义内容目录注入用户项目路径。`render(source, { fileURL, frontmatter, context })` 可显式传入 `context.index`、`context.current`、`context.target`（`web` 或 `feed`）及反向链接。结果保留 `code` / `metadata`，增加 `diagnostics`。

Vault 的 `.vault-cache/markdown-index.json` 是构建期数据，不放进 `public/`，不导入浏览器。它保留公开正文、私人笔记路径存根、来源映射、已解析附件和反向链接；私人及加密正文不写入索引。原始 Vault 不被修改。

构建摘要只输出诊断类别和数量。YAML、配置类型及其他非引用类构建错误保持既有行为。

## 扩展与视觉契约

新增语法接入共享 Remark/Rehype 注册表和 Markdown manifest，不复制页面专用解析器。嵌入展开先于语法特征探测，因此嵌入携带的公式、代码、Callout 和 Mermaid 同样获得条件资源。

已有排版、KaTeX、代码、图片、表格和提示组件样式未被整体改写。新增 CSS 仅作用于 `obsidian-*` 引用、占位、嵌入和媒体节点。任务框仅补充可访问名称，不改变几何。

静态兼容不包括 Dataview 查询执行、Templater 脚本、Canvas、任意 npm 插件或工作区文件导出。Vault 中的工作区文件包含和目录导出转换为不可用引用，不读取目标，也不阻止发布。

## 验证

- CommonMark 官方 0.31.2 示例验证扩展定界符之外的基础 AST 不变；扩展冲突、HTML 和引用另有测试。
- Node：`tests/plugins/markdown/obsidian.test.mjs`、`commonmark.test.mjs`；Vault：`tests/content/vault-markdown.test.mjs`；内容目录适配：`tests/content/markdown-package-mode.test.mjs`。
- 浏览器：`tests/site/obsidian-markdown.spec.ts`，覆盖原生交互、无脚本、窄屏、可访问性、既有组件计算样式对照和九类 Mermaid。
- 既有插件、manifest、Astro Check、生产构建及发布隐私验证仍需通过。npm 内容目录适配测试不等同于 npm 发布流水线验收。
