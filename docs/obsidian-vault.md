# 原生 Obsidian 知识库

日常只在 `Obsidian-Vault` 中写笔记。默认私人，公开是一项 Markdown 属性。
本机路径：`D:/Projects/Blog/Obsidian-Vault`。模板在“模板”，粘贴图片进入“附件”。
Properties 默认隐藏，需要时通过 Obsidian 原生命令显示文件属性。

## 公开规则与模板

只有布尔值 `publish: true` 和允许的 `type` 同时存在才可能公开；缺失属性、字符串 `"true"`、普通笔记类型一律私人。
文件夹仅用于整理，不决定发布。模板、隐藏目录和符号链接不参与收集。

| type | 网站内容 | 常用属性 |
| --- | --- | --- |
| article | 博客文章 | title、slug、date（可选）、category、tags、series、cover |
| moment | 动态 | date（默认填写，可删除）、location、mood、images |
| movie / book | 影视书籍与 Markdown 详情 | title、creator、cover、rating、status |
| device | 设备 | name、brand、category、specs、image、order |
| link | 网址导航，每网址一份笔记 | title、url、group、icon、cover、order |
| friend | 友链 | title、url、cover、tags |
| project | 项目 | title、phase、technologies、cover、website、repository |
| announcement | 公告 | 默认 title、date、link；可选 publishAt、unpublishAt；正文即公告 |
| album | 相册 | key（支持中文）、cover、passwordSecret；正文直接插入图片 |
| category / tag / series | 可选分类、标签、系列描述 | key、name/title、parent |
| skill / timeline / anime | 原有数据页 | 使用迁移笔记中的原有属性 |
| page | 特殊正文页 | key: about 或 friends |

分类、标签和系列可以直接填写文章属性，不必建立定义笔记。
设备、项目、友链等正文是网站介绍的单一编辑来源；迁移时去除重复属性。模板和使用说明已从默认关系图谱过滤。
标题默认文件名。显示日期统一使用 `date`；留空或省略时，文章、动态及公告不显示日期。日期或完整时间都可填写，时间显示到秒。
博客模板不带日期，动态模板自动填写日期和时间；公告模板默认带空 `date`、`link`。日记模板和每日笔记插件已停用。
`title` 只负责显示标题，`slug` 负责文章网址；两者可以一起改，修改 `slug` 会更换网址，旧网址不自动跳转。
时间支持 `2026.10.20 03:13:15`、`2026.10.20 3:13:15`、`2026.1.2 3:4:5` 和原 ISO 格式，省略时区默认东八区。显示日期与发布窗口互不替代，`publishAt` / `unpublishAt` 仅控制公开和撤下。
转换器在生成物中保留内部排序日期和 `displayDate` 标签，未填写日期时标签为空。npm/普通主题的既有日期接口保持兼容；原 Vault 的 published/publishedAt/updated/updatedAt 已迁移为 date。
只写 `3:13:15` 时，发布日期以笔记 `created` 或 Git 首次创建日期补齐；新笔记以本地文件创建日期兜底。预约等字段的纯时间优先使用已填写的发布日期，再用创建日期，避免随 CI 重建日期漂移。实现位于 `tools/vault/time.mjs`，日历及钟点范围严格校验。
迁移内容保留原有固定标识、排序、可见状态和日期。

`![[图片.png]]`、标准 Markdown 图片、相对附件路径和封面 `[[图片.png]]` 自动转换。
只收集公开内容实际引用的附件，使用内容哈希去重，相邻私人附件不会被复制。
同名有歧义时使用完整 Vault 内路径。指向私人或未公开笔记的链接保留作者写入的文字，点击提示“未发布”；嵌入显示“暂未公开”，不读取或展开正文。
相册直接在正文粘贴或拖入图片即可，默认取第一张作封面；原有高级照片属性保留兼容。旧相册的隐式封面已迁成明确引用。
私人嵌入、越界访问、失效附件、文件包含和代码目录导出只使对应引用失效，不阻止其他内容发布。公开属性和正文仍应按对外内容填写。完整兼容与降级规则见 [Obsidian Markdown](obsidian-markdown.md)。

`publishAt` / `unpublishAt` 使用带时区 ISO 时间或无时区的北京时间，开始包含、结束不包含。
Actions 每半小时检查窗口，受排队影响，不承诺实时发布。公开内容指纹未变时跳过完整构建。
取消公开或删除笔记后，成功构建会清除详情、列表、聚合、RSS、Sitemap、搜索和独占附件。

## Windows 自动同步

本机已安装 Obsidian Git 2.42.0，使用现有 Git Credential Manager 凭据。
启动自动拉取，停止编辑两分钟后提交并同步，每五分钟检查远端。使用普通 merge，禁止强制覆盖。
仅保留错误通知，隐藏 Git 状态栏并关闭重型 Source Control 轮询。
插件、启用清单及凭据为设备本地文件，不提交 Vault。
软件关闭前未推送的修改仍在本地，下次启动或联网后继续处理；不保证强制结束进程时完成网络推送。

### 本机图片自动入库

日常操作和属性说明保存在 Vault 的“使用说明.md”。粘贴、拖入图片优先使用 Obsidian 原生附件功能。
Windows 本机另外安装一个 Git pre-commit hook：在 Obsidian Git 的普通提交前，把已暂存笔记实际引用、且能访问到的库外图片复制进 `附件/导入/<内容哈希>.<扩展名>`，再更新笔记引用并一同暂存。支持常见图片格式的 Markdown、引用式图片、wiki 图片、HTML `img` 和单行封面属性；跳过远端 URL、代码示例和部分暂存的笔记，保留源文件。无法定位的文件不会凭同名猜测或自动下载。

代码全部位于源码仓 `tools/vault/import-local-images.mjs`，设备入口只保存在 Vault 的 `.git/hooks/pre-commit`，不增加 Obsidian 插件或驻留进程。只复制引用的文件，其他私人附件仍由发布白名单隔离。自动入库发生在**本机提交之前**，GitHub 构建不能访问电脑硬盘；手机应先用原生方式把图片保存进库内。

在另一台已安装源码依赖和 Node.js 的电脑上，从源码仓执行：

```powershell
node tools/vault/install-image-hook.mjs ../Obsidian-Vault
node --test tests/content/local-images.test.mjs
```

安装器保留已有的其他 pre-commit hook 并拒绝覆盖，需人工合并；此 hook 不随 Vault 克隆传播。

旧盘符、失效相对图片及其他引用问题会在页面局部显示提示，并在构建时汇总数量，不阻止发布。配置、YAML 或其他非引用错误仍可能使构建失败，此时线上保留上一个成功版本。修复后重新同步即可，不要求移动到“博客”文件夹。

## Android 首次连接

Obsidian Git 官方提示移动端不稳定并受内存限制。Android 推荐其建议的原生 [GitSync](https://github.com/ViscousPot/GitSync)。

1. 安装 GitSync，用自己的 GitHub 账号授权，选择 `Zhaozhiii/Obsidian-Vault`。
2. 克隆到 Obsidian 可访问的本地文件夹，在 Obsidian 将该文件夹作为知识库打开。
3. 在 GitSync 选择 Obsidian，启用应用打开/关闭时同步。按 Android 提示授予文件夹及应用切换检测权限；如需后台同步，允许必要的电池策略例外。
4. 手机不启用 Obsidian Git，避免两个同步器同时修改 `.git`。插件启用清单不从 Windows 同步。
5. 首次验证电脑新建→手机收到、手机新建→电脑收到、离线修改→联网恢复，以及中文图片显示。

手机不需要终端、CMS、Node.js 或构建依赖，后台仍受 Android 系统限制。
手机授权必须在设备上完成。本次未连接手机，不能将手机授权和实机往返测试标记为已完成。

## 冲突和离线

断网不影响本地保存，联网后重试。换设备前给同步留出时间。
Windows 使用 Obsidian Git 冲突列表，Android 使用 GitSync 冲突提示。无法确定时保留两份副本再人工整理。
禁止 force push、自动覆盖某一方、删除 `.git` 后覆盖克隆，或在有未同步修改时重置工作区。
同一设备仅运行一个 Git 同步器。

## 两仓架构

- `shirone-Zh`：页面、组件、样式、`tools/vault` 转换器、`site/config` 配置、`site/data` 音乐快照、品牌资源、工作流和开发文档。
- 私有 `Obsidian-Vault`：Markdown、必要附件、少量原生配置。隐藏 `.github` 只有复用工作流入口和源码版本通知标记。

正式构建运行在私有 Vault Actions，复用源码仓 `.github/workflows/publish-vault.yml`。
公开源码 CI 只用合成夹具，验证后用仅限 Vault 的 deploy key 更新隐藏标记触发发布。
源码和内容锁定提交；服务器激活前检查最新版本；并发队列合并连续提交。
私人 Markdown 不作为 Actions 制品上传，生产编译、检查与构建不打印源正文或属性值。
发布物只含可公开静态网站与原有最小服务。定时内容由 Actions 检查，阿里云无需 CMS 定时服务。
音乐脚本及日更工作流集中在源码仓，保留完整音轨检查和现有播放器。

加密文章沿用原客户端加密。建议 `encrypted: true` 和 `passwordSecret: BLOG_NOTE_PASSWORD`。
在私有 Actions Secret `VAULT_PASSWORDS` 中保存 JSON 映射，例如 `{"BLOG_NOTE_PASSWORD":"你的密码"}`。
原示例相册密码只留在私有笔记；打包前移除相册原始 manifest。相册保护清单，不承诺已知图片 URL 的访问控制。
结构化公开数据只包含该类型允许字段，私人自定义属性不会导出。

```powershell
node scripts/content/sync.mjs --production
node --test tests/content/vault.test.mjs tests/deploy/workflow.test.mjs
npx.cmd astro check
pnpm.cmd build
node tools/vault/verify-dist.mjs ../Obsidian-Vault dist
```

## 回滚与恢复

迁移已完成，日常仅使用源码仓和原生 Vault。一次性迁移程序及其专用测试已移除。
本机旧内容仓、动态 CMS 残留目录、一次性迁移与验收工具、备份及构建临时产物已于 2026-10-24 集中移动到 `D:/Projects/Blog/废弃文件/`，由用户统一删除；该目录不参与现行构建。
`.tools/native-secrets/` 中的现用部署密钥和 `.tools/pnpm-runtime/` 中与项目版本一致的 pnpm 保留原位。
迁移前 Git bundle、工作副本和日期迁移备份随旧文件一并归入废弃文件夹；删除后通过源码仓及 Vault 的 Git 历史恢复日常内容。
远端旧仓库保持归档，服务器原有成功发布版本保留。
内容回滚可在私有 Actions 手动运行时指定完整 `content_sha`；仍检查源码版本。
单篇笔记优先用 Git 历史或 Obsidian File Recovery 恢复，先另存当前版本。
构建失败不触碰当前网站，部署使用原校验和原子切换机制。

实际验收结果见 `docs/refactor-acceptance.md`。手机端首次授权和实机验收仍需在设备上完成。
