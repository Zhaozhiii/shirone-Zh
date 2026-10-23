# Zhaozhiii 博客运维

正式地址：<https://blog.zhiii.top>。主题源码与个人内容分仓维护，保留 Shirone 默认视觉。

## 本地开发与写作（Windows PowerShell）

```powershell
cd D:\Projects\Blog\shirone-Zh
npx.cmd --yes pnpm@9.14.4 install --frozen-lockfile
pnpm.cmd dev
pnpm.cmd content:watch
```

使用 Node.js 24。内容仓为相邻目录 `D:\Projects\Blog\Shirone-Zh-Content`（<https://github.com/Zhaozhiii/Shirone-Zh-Content>），由 `shirone.content.json` 指向。文章写入内容仓的 `content/posts/`，动态写入 `content/moments/`，个人配置写入 `config/*.yaml`，页面数据和图片分别在 `data/`、`assets/`、`public/`。`pnpm.cmd dev` 启动时自动同步；实时写作时在第二个终端运行 `pnpm.cmd content:watch`。

代码仓的 `src/content/` 等路径是同步副本，不再由代码仓跟踪，请直接编辑内容仓。旧 `new-post` 命令仍写入同步副本，当前请在内容仓直接创建 Markdown 文件。本地预览地址为 `http://localhost:4381`（本机的 4321 在 Windows 系统保留端口范围内）。
正文、示例文章与媒体内容不会因切换站点界面语言而自动翻译。

## 检查与发布

```powershell
# 修改代码后本地检查；纯内容修改可直接提交内容仓
pnpm.cmd check
git add <明确要提交的文件>
git commit -m "feat(content): add a new post"
git push origin main
```

推送后查看 <https://github.com/Zhaozhiii/shirone-Zh/actions>。PR 只检查和构建；`main` 的全部必要 CI 任务成功后才发布，也可在 Actions 中对 `main` 手动运行 Shirone CI。
跨仓自动发布已启用：内容仓推送 `content/`、`config/`、`data/`、`assets/`、`public/` 或内容清单后，由 `trigger-build.yml` 使用加密 Secret `DISPATCH_TOKEN` 通知主题仓。公开内容仓无需读取令牌。主题仓在 prepare 作业中一次锁定主题和内容提交号，所有检查、预览及构建使用同一个内容 SHA；内容变更触发时使用事件携带的精确 SHA。

发布流水线统一使用 Node.js 24，一次安装依赖，串行执行代码质量、Astro/TypeScript 检查、清单校验、单元测试及一次生产构建，不安装浏览器，也不运行 Playwright。页面外观与交互按需使用 Codex 内置浏览器检查。

发布版本为主题与内容提交号共同计算出的 40 位标识（`scripts/deploy/release-version.mjs`），只改文章也会生成新版本。`release.json` 与 `/healthz` 同时记录 `release`、`code`、`content`。上传前和激活前均核对两仓 `main`，过时构建自动跳过，部署中不强制中断容器切换。服务器负责检查首页和健康状态，Actions 只复核公开版本元数据；不再将无关旧站探测作为博客发布门禁。只修改内容仓 README 或 docs 不会触发重建。

在主题仓 Actions 手动运行 Shirone CI 时，可填写 `content_sha`（完整 40 位提交号）回滚到指定内容，留空则读取最新内容。显式回滚允许内容不是最新提交，但主题仍须是当前 main；也可按下述服务器命令回滚到已有发布版本。
GitHub 上的源码和 Actions 构建结果是日常发布入口，无需在服务器拉源码或安装主题依赖。

日常发布只需提交并推送，由 CI 构建和部署；不需要本地重复执行 `build` 或 `build:release`。需要离线发布包时，仅执行一次 `pnpm.cmd build:release`，它会自动构建并打包，同时更新 `artifacts/deploy/`、`artifacts/release.tar.gz` 和归档 SHA-256；本地与 CI 使用同一打包脚本。
`release.json` 记录两仓提交、共同发布版本和 `dirty` 标记。本地未提交改动允许生成验证用快照（`dirty: true`），正式发布前先提交并重新构建；CI 拒绝脏工作区、物化内容与锁定版本不符，以及与代码和内容计算结果不符的发布版本。
构建和打包均检查开发说明是否进入产物；页面及相册开发规则分别在 `rules/page-routes.md`、`rules/album-media.md`，不得放入 `src/pages/` 或 `public/`。
仓库使用 `.gitattributes` 固定文本换行为 LF，Biome 检查失败会阻止部署。

Actions 使用仓库 Secret `SERVER_SSH_KEY`，以及 Variables `SERVER_HOST`、`SERVER_USER`、`SERVER_KNOWN_HOSTS`。
密钥对应 `shirone-deploy` 用户；SSH 主机公钥已通过现有受信任连接核验，不在工作流中临时信任网络扫描结果。
密码、私钥、`.env` 和父目录服务器登录说明均不应提交。

## 服务、日志与回滚

服务器项目目录 `/srv/shirone-blog`；Compose 项目及容器名为 `shirone-blog`。
只读挂载站点文件，内部端口 `3103`，128MB 内存限制，通过现有 Nginx 按域名转发，不占用新的公网端口。
运行代码与依赖已打包为 `server.cjs`，`dist/` 是唯一静态文件根目录。

```bash
# 以服务器管理员身份查看状态与日志
docker ps --filter name=shirone-blog
docker logs --tail 100 shirone-blog
curl -fsS https://blog.zhiii.top/healthz

# 以部署账号或管理员身份回滚到上一成功版本
sudo -u shirone-deploy /usr/local/bin/shirone-blog-release rollback

# 回滚到仍保留的指定发布版本（从 /healthz 或 Actions 摘要取得 release）
sudo -u shirone-deploy /usr/local/bin/shirone-blog-release rollback <完整40位发布标识>
```

版本位于 `/srv/shirone-blog/site/releases/<SHA>`，`current` 指向当前版本，`previous` 指向上一个成功版本。
每次上传校验归档与逐文件 SHA-256，健康检查失败时恢复原版本。至少保留最近三个成功版本及当前/上一版本。
发布期间只重启新博客容器；旧站 `zhiii.top`、`www.zhiii.top` 和现有 API 的路由与应用保持独立。

## HTTPS 与入口配置

独立证书位于 `/etc/letsencrypt/live/blog.zhiii.top/`，沿用服务器现有 Certbot 每日续期任务。
Nginx 配置源为 `/root/blogweb/nginx/nginx.conf`，新博客使用单独的 `server_name blog.zhiii.top` 块。
变更入口前备份配置，执行 `docker exec blogweb-nginx nginx -t`，成功后执行 `docker exec blogweb-nginx nginx -s reload`。
不要运行旧项目的 `docker compose down` 或清理其他项目的镜像、卷、数据。

## 本地浏览器验证

```powershell
$env:PLAYWRIGHT_CHANNEL = "msedge"
$env:PLAYWRIGHT_PORT = "4381"
pnpm.cmd exec playwright test tests/site/a11y.spec.ts tests/site/banner.spec.ts
```

CI 不运行浏览器测试。新增 Node.js 静态服务的独立测试运行 `pnpm.cmd test:server`，覆盖 404、HEAD、MIME、缓存、范围请求和静态根目录隔离。

## 切换到作者修改版

主题上游为 https://github.com/fqzlr/shirone-fq 。旧 Shirone-blog 不再发布此域名。
本仓通过独立的 Shirone-Zh-Content 内容仓维护内容，不访问作者的私有内容仓。迁移时文章和动态目录为空；
页面、功能及外观配置保持 Fork 默认，站点信息使用 Zhaozhiii 与 blog.zhiii.top。
作者私有壁纸和配置未随 Fork 提供，缺失素材使用官方模板默认素材。
显示设置中可选择全屏壁纸、Hero 模式、覆盖透明、模糊度和卡片透明度。
未来文章写入内容仓 content/posts/，站点资料在 config/site.yaml 和 config/profile.yaml 中修改。
