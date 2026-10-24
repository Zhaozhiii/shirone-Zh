# Markdown 重构验收记录

验收日期：2026-10-25（北京时间）。本轮仅修改源码与构建生成物，未修改原始 Vault 笔记、提交 Git 或部署线上。

## 验证结果

| 项目 | 结果 |
| --- | --- |
| 相关 Node 回归 | 191 项通过，0 失败；覆盖现有插件、引用、嵌入、资源、Vault 发布、元数据和内容目录适配 |
| CommonMark 基线 | 使用官方 0.31.2 的 652 条示例；其中 615 条不涉及新增扩展定界符的示例验证基础 AST 不变，其余语法冲突由扩展用例单独覆盖；不宣称全部示例逐字 HTML 一致 |
| 浏览器 | 11 项通过，使用仓库 Playwright 配置、单 worker 和本机 Edge |
| 无障碍 | 扩展示例 axe 扫描通过；首页、首页网格和动态页浅深色共 6 项扫描通过 |
| 原有视觉 | 代表性标题、段落、列表、引用、提示框、表格、KaTeX 和代码块在浅深色下，对照引入 Obsidian 阶段前后的计算样式和几何一致；没有整体替换 Typography 或引入 Obsidian CSS |
| 导航与降级 | 原生提示、键盘操作、无 JavaScript、窄屏、Swup 替换及后退通过；离开消费者后移除 Obsidian 条件样式 |
| Mermaid | 流程、时序、类、状态、甘特、ER、饼图、旅程和思维导图均通过现有运行时渲染为 SVG |
| Astro Check | 0 errors、0 warnings；保留两条原有 hints：PostCard 的未使用 updated 和文章 img onerror 属性的 src 分析提示 |
| TypeScript | `tsc --noEmit --isolatedDeclarations` 通过 |
| Biome | `biome ci ./src` 检查 443 个文件通过 |
| Manifest | atoms、Markdown 和 skills 清单校验通过 |
| 生产构建 | 完整 `pnpm run build` 通过，包括内容同步、字体、Astro、发布物处理、Pagefind 和 dist 检查 |
| 发布隐私 | `node tools/vault/verify-dist.mjs ../Obsidian-Vault dist` 通过 |
| 补丁检查 | `git diff --check` 通过 |

## 关键行为

- 未公开、私人、越界、缺失附件、歧义及循环引用均不阻止发布，只替换对应引用。
- 未公开链接保留作者写入的文字，原生交互提示“未发布”；嵌入提示“暂未公开”。越界目标在读取前拒绝，不复制受限制资源。
- 嵌入按来源解析附件，重复实例隔离标题、块和脚注 ID；指向嵌入选区之外的链接返回来源笔记。
- 动态同页的独立 Markdown 片段也隔离标题、脚注和提示框 ID，避免跨条目冲突。
- 标题锚点、块 ID、HTML 显式锚点、别名、编码路径、百分号和附件片段有专项用例。
- KaTeX 保留原有外观与资源；宏按文档隔离，同篇支持共享定义。RSS 复用解析和引用结果后降级，不再单独使用 MarkdownIt。
- 注释从正文及公开结构化卡片描述中移除；不收集注释中的附件。原始 Vault 始终只读。

## 兼容边界

公式以 KaTeX 的能力为准，不执行 MathJax 专属命令、Dataview、Templater 或任意脚本。完整语法说明与限制见 [Obsidian Markdown](obsidian-markdown.md)。

npm 模式已通过默认源码目录、`shirones/content` 和自定义内容目录三类适配测试；独立的 npm 打包发布流水线不在本次本机验收范围内。视觉验收覆盖代表性组件及当前站点页面，不将其表述为所有文章的逐像素穷举验收。
