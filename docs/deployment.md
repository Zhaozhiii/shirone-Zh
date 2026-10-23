# Zhaozhiii 博客运维

正式地址：<https://blog.zhiii.top>。源码与示例内容在同一仓库维护，保留 Shirone 默认视觉。

## 本地开发与写作（Windows PowerShell）

```powershell
cd D:\Projects\Blog\shirone-Zh
npx.cmd --yes pnpm@9.14.4 install --frozen-lockfile
pnpm.cmd dev
pnpm.cmd new-post my-first-post
```

使用 Node.js 24。配置在 `src/config/`，文章在 `src/content/posts/`；本地预览地址为 `http://localhost:4381`（本机的 4321 在 Windows 系统保留端口范围内）。
正文、示例文章与媒体内容不会因切换站点界面语言而自动翻译。

## 检查与发布

```powershell
pnpm.cmd check
pnpm.cmd type-check
pnpm.cmd check:manifest
pnpm.cmd test:server
pnpm.cmd build
git add <明确要提交的文件>
git commit -m "feat(content): add a new post"
pnpm.cmd build:release
git push origin main
```

推送后查看 <https://github.com/Zhaozhiii/shirone-Zh/actions>。PR 只检查和构建；`main` 的全部必要 CI 任务成功后才发布，也可在 Actions 中对 `main` 手动运行 Shirone CI。
GitHub 上的源码和 Actions 构建结果是日常发布入口，无需在服务器拉源码或安装主题依赖。

`build:release` 同时更新 `artifacts/deploy/`、`artifacts/release.tar.gz` 和归档 SHA-256；本地与 CI 使用同一打包脚本。
`release.json` 记录当前提交和 `dirty` 标记。本地未提交改动允许生成验证用快照（`dirty: true`），正式发布前先提交并重新构建；CI 拒绝脏工作区和与检出提交不符的版本号。
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

# 回滚到仍保留的指定提交
sudo -u shirone-deploy /usr/local/bin/shirone-blog-release rollback <完整40位提交SHA>
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

CI 使用默认 Chrome。新增 Node.js 静态服务的独立测试运行 `pnpm.cmd test:server`，覆盖 404、HEAD、MIME、缓存、范围请求和静态根目录隔离。

## 切换到作者修改版

主题上游为 https://github.com/fqzlr/shirone-fq 。旧 Shirone-blog 不再发布此域名。
本仓采用本地内容模式，不访问作者的私有内容仓。文章和动态目录初始为空；
页面、功能及外观配置保持 Fork 默认，站点信息使用 Zhaozhiii 与 blog.zhiii.top。
作者私有壁纸和配置未随 Fork 提供，缺失素材使用官方模板默认素材。
显示设置中可选择全屏壁纸、Hero 模式、覆盖透明、模糊度和卡片透明度。
未来文章写入 src/content/posts/，提交并推送 main 后由 GitHub Actions 自动部署。
