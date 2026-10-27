# Markdown 正文契约

正文以配置的 `upstream/main`（`fqzlr/shirone-fq`，基准提交 `dbf6e0b`）实际解析链为准。`src/utils/markdown-processor.mjs`、相关插件、语法清单和 npm integration 使用上游实现。

保留 CommonMark、GFM、脚注、KaTeX、Mermaid、Expressive Code、原生提示框、折叠面板、选项组、文件树、代码树、媒体组件等既有能力。`![描述 w-50%](图片 "图注")` 的宽度与图注来自上游 `rehypeMarkdownImages`；标准 GitHub alerts 和 `:::note`、`:::details` 等由上游 admonition 组件拥有。字体、正文 CSS、灯箱、动效、主题切换和 Swup 资源生命周期保持原有实现。

已删除 Obsidian 专用 tokenizer、Wiki 链接、递归嵌入、块引用、反向链接、正文标签提取、注释/上下标/行内脚注转换、Callout 别名/折叠映射和图片/公式后处理。此类写法按上游解析结果显示，不再单独适配。不会自动迁移或改写已有文章。

YAML 属性继续通过原有发布流程处理，包括 `title`、`published`、`tags`、`category`、`draft`、`image`、发布时间和可见状态。`publish: true` 才参与公开；`draft: true`、`visible: false` 或 `hidden: true` 不输出公开记录。保留原有时间显示及发布窗口规则。封面等元数据中的现有附件引用仍兼容。

## 本地附件

发布搬迁文件时，仅处理标准 Markdown 的资源目标地址，不转换正文语法、不重排或序列化正文 AST。通过现有 remark-parse/GFM 识别图片、链接和引用定义，解析相对路径、Vault 根路径或无歧义文件名，并将实际引用的附件复制到内容哈希地址。中文目录、空格、`%20`、百分号文件名和 URL 片段保留正确语义。远端 URL、行内代码和围栏代码不改动。

```markdown
![](附件/Pasted%20image%2020261026185132.png)
![图片 w-50%](<附件/带 空格.png> "上游图注")
![引用图片][photo]

[photo]: 附件/example.png
[下载](附件/manual.pdf#page=2)
```

普通 Markdown 笔记链接（带 `.md` 或省略扩展名）可映射到已公开文章、动态及页面的 URL，并保留查询参数和锚点。例如 `[设计文档](博客/博客设计)` 会解析到该公开笔记的文章网址，动态链接则指向 `/moments/#moment-标识`。按笔记所在目录、Vault 根路径或无歧义文件名定位；同名歧义应填写完整路径。私人笔记不作为附件复制，也不展开正文。失效或有歧义的资源保留作者地址，并输出构建诊断，不注入提示组件。库外图片继续由现有本机提交 hook 入库，该工具不介入站点正文渲染。

## 验证

`node --test tests/content/vault*.test.mjs tests/content/markdown-package-mode.test.mjs tests/plugins/markdown/commonmark.test.mjs`；其余上游插件单测、语法清单、Astro check、生产构建及浏览器直接访问/Swup/主题/灯箱验收共同保证回归边界。详见 `markdown-compatibility-validation.md`。
