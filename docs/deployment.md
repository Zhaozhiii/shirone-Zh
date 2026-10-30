# 当前部署入口

正式发布运行在私有 `Zhaozhiii/Obsidian-Vault` Actions，复用源码仓 `.github/workflows/publish-vault.yml`。
公开源码 CI 使用合成夹具。构建、白名单转换、音乐同步和部署逻辑集中在源码仓。

侧栏“构建平台”显示托管平台名称：正式发布通过 `SHIRONE_BUILD_PLATFORM` 指定为 `阿里云`；非托管构建显示构建机的操作系统与处理器架构（如 `Windows / x86_64`）。

[两仓架构、手机同步与回滚](obsidian-vault.md)。

## 阿里云静态托管

`deploy/nginx-blog.conf` 是 `blog.zhiii.top` HTTPS server 内的配置片段。入口 Nginx 由 `/srv/drive-service/compose.yaml` 管理，`deploy/compose.yaml` 作为覆盖文件增加站点父目录和配置片段的只读挂载：

```sh
docker compose -f /srv/drive-service/compose.yaml -f /srv/shirone-blog/compose.yaml up -d --no-deps nginx
```

生效配置的博客 server 内使用 `include /etc/nginx/snippets/shirone-blog.conf;`，保留原证书和 HTTP ACME/HTTPS 跳转。父目录挂载保证 `current` 切换后能立即读取新版本；不能只挂载一个已解析的 release 目录。

`deploy/release.py` 安装为 root 拥有的 `/usr/local/bin/shirone-blog-release`，仍由 `shirone-deploy` 调用。发布与回滚只在该用户拥有的站点目录内执行解包、校验和原子切换，无需 Docker 权限或 sudo。入口配置变更属于运维操作，日常 Actions 不修改入口。

发布包为 `dist/`、`health.json`、`release.json` 与 `SHA256SUMS`。`/healthz` 必须返回当前版本的 `status/release/code/content`；激活校验完整身份和首页可用性，失败自动恢复旧链接。旧包中的 `server.cjs` 仅作为历史兼容文件接收，不再执行。

静态托管契约测试使用同一份配置及固定摘要的 Nginx 镜像，在独立容器和临时数据上执行，不访问生产文件：

```sh
python3 tests/deploy/release.test.py
python3 tests/deploy/nginx.test.py
```

以上 Python 测试在 Linux 运行，Nginx 测试需要 Docker。覆盖解包校验、版本健康、自动回滚、无重启切换、页面及跳转、404、GET/HEAD/405、缓存/MIME、Range 和私有路径隔离；公开 CI 自动执行。
