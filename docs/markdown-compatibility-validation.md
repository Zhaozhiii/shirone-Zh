# Shirone 上游 Markdown 恢复验收

验收日期：2026-10-26（北京时间）。仅修改源码、测试和开发文档；原始 Vault 笔记和当前文章文件均未改动。生产发布通过现有 GitHub Actions 流程执行，最终部署状态以该次工作流及线上 `/healthz` 的源码版本为准。

## 基准与范围

基准为已配置的 `upstream/main`：`fqzlr/shirone-fq` 的 `dbf6e0b`。直接用 Git 比较确认以下生产入口与上游无差异：

- `src/plugins/` 整个目录，包括图片增强、提示框、语法清单和所有原生组件；
- `src/utils/markdown-processor.mjs` 及类型声明；
- `src/utils/markdown-source-syntaxes.mjs` 及类型声明；
- `src/utils/feed.ts`；
- `src/integration/index.ts`。

删除 Obsidian tokenizer、语法转换、引用索引、递归嵌入、反向链接、正文标签提取、专用 CSS 和额外公式/图片后处理。普通图片宽度、图注和原生提示框完全由上游实现拥有。元数据及本地附件发布仍在内容层处理，不把兼容插件接回正文链。

## 验证结果

| 项目 | 结果 |
| --- | --- |
| Markdown、内容和工具 Node 回归 | 共 320 个不同用例完成验证；首轮 319 项通过，修正一个测试夹具的相对路径后，其所属 7 项全部重跑通过 |
| 部署与工作流 Node 回归 | 10 项通过 |
| 普通 Markdown | 真实生产处理器验证标题、段落、强调、删除线、代码、列表、引用、分隔线、链接、GFM 表格/任务和脚注 |
| 原生增强语法 | 图片宽度与图注、GitHub alert、details、KaTeX、Mermaid；既有容器、代码和媒体插件测试通过 |
| 本地附件 | 中文路径、空格、`%20`、相对路径、引用式图片、普通文章链接、PDF 片段、去重；代码示例和未使用的相邻附件不复制 |
| 元数据 | 标题、发布日期、封面、标签、分类、草稿、`visible: false` 和 `hidden: true` 通过；正文标签不再覆盖 YAML |
| 浏览器 | 4 项通过：直接加载、灯箱/Mermaid/代码/公式/图注、Swup 离开与后退、窄屏、浅深色切换、禁用 JavaScript 的 SSR 与原生键盘折叠；SSR 项针对减少动画环境重跑通过 |
| 无障碍 | 首页、首页网格、归档、动态、关于、分类索引、标签索引的浅深色共 14 项通过 |
| Astro check | 0 errors、0 warnings，保留两条既有 hints（PostCard 的 unused updated 和文章 img onerror 的 src 分析提示） |
| TypeScript | `tsc --noEmit --isolatedDeclarations` 通过 |
| Biome | `biome ci ./src` 检查 437 个文件通过；新增测试及内容发布代码专项检查通过 |
| 清单 | atoms、Markdown 和 skills 清单校验通过 |
| 生产构建 | 隔离目录完整运行 `pnpm build` 通过，包含内容同步、字体、Astro、Pagefind 和 dist 检查 |
| 产物图片 | 34 个 HTML 页面、53 处本地图片引用，缺失图片 0 |
| 发布隐私 | `tools/vault/verify-dist.mjs` 通过 |
| 原始文件 | 对 Vault Markdown 和当前 `src/content` Markdown 分别逐一比对 SHA-256，均未改变 |

## 验收环境与边界

生产构建和浏览器运行于 `D:/Projects/Blog/.diagnostics/upstream-restore-20261026`。使用仓库 Playwright 配置、单 worker、Edge；验收副本通过依赖目录链接复用已安装的软件包，因此仅在该副本中增加 Vite 文件允许路径。正式配置未改变。

浏览器用例使用临时的合成文章和 SVG，开始前确认路径未占用，等待 Astro 收录，结束后删除。代码块外观仍由 Astro Expressive Code 集成负责；离线渲染器不自行复制其集成配置。订阅源恢复上游原有 MarkdownIt 路径。

现有 Obsidian 专用写法按上游结果显示，不自动迁移文章。独立 npm 发布流水线未执行；本轮验证了 integration 与上游一致及源码、包模式默认目录和自定义目录下的渲染入口。此轮验收覆盖代表性正文与当前站点页面，不宣称所有文章逐像素相同。
