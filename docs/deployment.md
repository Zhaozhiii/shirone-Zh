# 当前部署入口

正式发布运行在私有 `Zhaozhiii/Obsidian-Vault` Actions，复用源码仓 `.github/workflows/publish-vault.yml`。
公开源码 CI 使用合成夹具。构建、白名单转换、音乐同步和部署逻辑集中在源码仓。

侧栏“构建平台”显示实际构建与部署环境：正式发布通过 `SHIRONE_BUILD_PLATFORM` 指定为 `GitHub Actions + 阿里云`；非托管构建显示构建机的操作系统与处理器架构（如 `Windows / x86_64`）。

[两仓架构、手机同步与回滚](obsidian-vault.md)。
