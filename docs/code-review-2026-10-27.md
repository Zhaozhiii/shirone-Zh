# 网站代码逻辑审查与链接修复

审查日期：2026-10-27（北京时间）。本记录描述审查及本地验收结果；后续提交和部署状态以 Git 与发布流水线记录为准。

## 已确认并修复

| 问题 | 根因与修复 | 验证 |
| --- | --- | --- |
| 动态中的“设计文档”链接访问错误 | Vault 转换器只解析带 `.md` 的笔记路径，省略扩展名的 `博客/博客设计` 被浏览器相对于 `/moments/` 解析。现在使用完整笔记清单解析省略扩展名的标准 Markdown 链接，生成文章的公开 URL。 | 先复现失败的单测，再验证真实生产构建中的链接、Swup 跳转与浏览器返回。 |
| 动态链接带查询参数时破坏锚点 | 直接拼接后缀会生成 `/moments/#moment-target?q=test`。现在分别合并 query 与 fragment，生成 `/moments/?q=test#moment-target`。 | Vault 链接单测。 |
| 含 Markdown 转义的链接和图片无法重写 | AST 中 URL 已被解码，无法在原文中直接找到；旧逻辑还可能把标题中的 `](` 当成链接边界。现在定位原文目标地址区间，支持转义括号、嵌套标签、引用式定义及尖括号目标，保留标签和图注。 | 转义图片、文章链接、嵌套图片链接与引用定义单测；既有附件测试。 |
| 具体相册和系列的链接进入索引页 | 公开笔记 URL 映射忽略了实体 key。现在生成 `/albums/<key>/` 和 `/series/<key>/`。 | Vault 详情路由单测。 |
| 错误编码的链接中断整站构建 | `decodeURIComponent` 异常从资源解析器直接抛出。现在把无效目标作为局部诊断，保留作者原文，继续处理其他内容。 | 非法 UTF-8 百分号编码单测。 |
| 筛选更新丢失锚点及 Swup 历史状态 | 多个页面调用 `history.replaceState(null, ...)` 并重建不含 hash 的 URL。现在通过共享工具仅更新 query，保留 hash、其他参数与 `history.state`。 | 纯函数测试；动态、友链、设备、项目、网址导航和相册的浏览器测试。番剧使用同一工具，本站关闭该页面，未做启用态浏览器验收。 |
| 深链接无法打开第 10 条之后的动态 | 分页仅渲染前 10 条，目标元素不存在。现在水合后自动展开到目标条目并定位，同时处理原生 hashchange 和 Swup 同页锚点事件，卸载时清理监听。 | 12 条合成动态覆盖直接打开、跨页 Swup 导航和同页锚点。 |
| 导航栏目高亮错误或缺失 | 所有页面的 `tag`、`category` 参数都被视为文章分类筛选；部分已有路由没有匹配。现在仅在归档路由解释分类参数，并补齐分类、标签、系列、电影书籍、留言和赞助页面标识。 | 导航映射单测。 |
| 相册搜索未同步 URL | effect 首次执行在未初始化分支返回，普通布尔标记的后续修改不能重新触发依赖跟踪。改为响应式初始化标记。 | 复现首次打开后筛选不更新 URL，再验证输入和清空均正确同步。 |
| 搜索清空后残留结果、旧请求覆盖新结果 | reactive 分支跳过空字符串，异步结果没有顺序校验。现在空白查询清空结果并关闭桌面面板，使用请求版本阻止过期结果和异常更新当前状态。 | 生产预览下的清空、旧请求晚于新请求、清空后旧请求返回三项测试。 |
| 设备分类筛选缺少合法的分组语义 | 普通 div 使用 aria-label，触发 axe 的 aria-prohibited-attr。添加 group 角色。 | 设备页明暗双模式 axe 扫描通过。 |

## 审查范围与结果

- 内容链：Vault 公开白名单、草稿和发布时间过滤、附件路径与符号链接限制、内容物化、Markdown 目标重写、文章/动态排序及详情 URL。
- 前端链：筛选状态与 URL、分页、导航高亮、持久外壳与 Swup 生命周期、搜索异步状态和直接访问/客户端导航。
- 输出链：RSS/Atom、LLMS 加密内容过滤、密码保护约束、相册构建清单清理、静态资源路径和发布校验。相关已有单元测试全部通过。
- 对真实内容构建执行私人正文和密码泄漏检查，通过。未改写 Obsidian 原笔记，原有未提交编辑保留。
- 对 26 个生成 HTML 页面扫描 1,608 处同源 href/src 引用。正常页面和资源没有发现缺失；仅两个已关闭页面的重定向产物指向 `/404/`，见下述边界。
- 本地生产预览中的首页、归档、动态、电影书籍、网址导航、项目、设备、关于、分类、标签、系列、RSS 和 Atom 共 13 个入口均返回 200。
- 真实动态中的“设计文档”最终指向 `/posts/%E5%8D%9A%E5%AE%A2%E8%AE%BE%E8%AE%A1/`。点击及返回成功，并确认保留同一个文档，未发生整页刷新；该浏览器验收未捕获到 JavaScript 页面异常。

## 验证记录

| 检查 | 最终结果 |
| --- | --- |
| 全量 Node 单元测试 | 374/374 通过，0 跳过 |
| Astro check | 0 errors、0 warnings，2 个既有 hints |
| TypeScript 声明检查 | 通过 |
| Biome 只读检查 | 438 个文件通过 |
| 原子、Markdown 和 skills 清单 | 通过 |
| 生产构建、字体预算、公开指令文件排除检查 | 通过 |
| 私人内容泄漏检查 | 通过 |
| 新增链接和筛选浏览器测试 | 9 项通过，包含针对发现问题的修复后复测 |
| 新增生产搜索浏览器测试 | 3 项通过 |
| 无障碍 | 首页两种布局、归档、友链、动态、项目、设备、关于、分类和标签，共 10 个页面/布局的明暗双模式通过；设备修复后定向复测 |
| git diff --check | 通过 |

本机使用仓库锁定的 pnpm 9.14.4。测试浏览器为已安装的 Edge，通过仓库 `PLAYWRIGHT_CHANNEL=msedge` 配置选择。

## 新增回归测试复现

链接和分页测试使用独立合成 Vault，避免写入用户笔记：

```powershell
node tools/vault/fixture.mjs .tmp/link-vault
node tests/fixtures/moment-links-vault.mjs .tmp/link-vault
$env:CONTENT_DIR = (Join-Path $PWD '.tmp/link-vault')
node scripts/content/sync.mjs
$env:VAULT_LINK_ACCEPTANCE = '1'
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npx.cmd playwright test tests/site/moment-links.spec.ts
Remove-Item Env:CONTENT_DIR
Remove-Item Env:VAULT_LINK_ACCEPTANCE
node scripts/content/sync.mjs
```

生产搜索测试先构建并在另一个终端运行 4321 端口的生产预览，仓库 Playwright 配置会复用该服务：

```powershell
pnpm.cmd build
pnpm.cmd astro preview --port 4321
# 另一个终端：
$env:PLAYWRIGHT_PRODUCTION = '1'
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npx.cmd playwright test tests/site/search-regression.spec.ts
```

## 尚需关注的边界

1. 关闭的番剧和留言页面仍由静态重定向产物跳向不存在的 `/404/`；最终依赖 Nginx 返回 404，构建包也没有自定义 `404.html`。这不是本次动态链接错误的来源。后续可统一禁用页面的构建输出、站点地图和自定义错误页，避免 soft-404/额外跳转。本次没有修改生产 Nginx 或页面启用策略。
2. 多个旧主题 UI 测试固定依赖上游演示内容，例如动态测试固定要求六条英文示例。它们不等同于本博客的真实内容验收。本次没有宣称全量旧 UI 套件通过，而是使用明确的合成数据覆盖新逻辑，并验证真实内容的生产输出。
3. 本次不包括第三方音乐源、外链网站及评论服务的长期可用性保证，也不是所有浏览器和设备的穷尽测试。审查阶段没有执行服务器变更、Git 提交、推送或线上发布。
