# Obsidian CMS

日常编辑入口为 Obsidian 的 **Shirone CMS**。本机内容库仍是
`D:/Projects/Blog/Shirone-Zh-Content`，远端为私有
`Zhaozhiii/Shirone-Zh-CMS`。原公开 Fork 保留历史，不再接收内容更新。

## 使用

1. 在 Obsidian 打开博客库，点击左侧面板图标或执行“Shirone CMS：打开博客管理”。
2. 选择文章、设备、项目等类型，点击“新建”，填写表单。新建内容默认为草稿。
3. 正文使用 Obsidian 编辑器；表格支持筛选、排序、复选框和批量属性编辑。
4. 拖放或粘贴图片到图片库，再从表单选择封面。引用中的图片不能直接删除。
5. “预览”自动启动本机预览，包含草稿；“指定时间预览”检查计划窗口。
6. 点击“发布”或“立即同步”。已发布内容保存后，停止编辑 60 秒自动同步；
   连续编辑最多每 5 分钟同步一次。
7. 状态栏显示同步、构建与部署进度。“部署成功”以线上 `/healthz` 为准。

“网站设置”中的表单覆盖全部配置领域。未修改的属性继承主题默认值；
“恢复继承”清除该项覆盖。导航、侧栏和复杂数组支持添加、移除及移动条目。
关于页正文可直接打开编辑。音乐快照继续由原自动任务维护，设置页可查看同步记录。

分类使用一个父级，可形成多层树；文章使用单分类、多标签、单系列。
稳定标识控制引用和网址，修改显示名称不会改变网址。系列内顺序与全局排序分别设置。
时间均按 Asia/Shanghai 解释，发布窗口包含开始时间、不包含结束时间。
服务器每分钟检查计划，到点提交时钟状态，再由 Actions 构建部署；
实际生效时间包含排队和构建时间。失败时线上保留上一个成功版本。

## 数据与构建契约

- `content/posts`、`content/moments`、`content/spec` 是原生 Markdown 内容。
- `cms/<类型>/*.md` 是结构化条目的唯一编辑来源，`cms/manifest.json` 记录接管领域。
- `cms/media` 保存新增图片原件及电影书籍笔记，原件目录不会被直接发布。
- `config/*.yaml` 是配置覆盖的唯一来源；表单保留已有字段并写入必要覆盖。
- `cms/publication-state.json` 是派生计划索引与固定评估时刻。修改计划后必须重新生成，
  CI 拒绝与源笔记不一致的索引。定时任务只提交这一个文件。
- `tools/cms/adapters.json` 保留主题原数据模块的类型和导出接口，编译时填入笔记数据。
  `src/content`、`src/data`、`src/user` 等物化副本不得作为编辑来源。
- 生产同步移除草稿、隐藏或发布窗口之外的内容，覆盖详情、搜索、订阅和索引。
  预览同步保留草稿；有指定时间时应用时间窗口。
- Obsidian `[[内部链接]]` 与 `![[图片]]` 在 CMS 编译时转换；内部链接须唯一且可解析。
  标准 Markdown 链接、现有图片和主题扩展语法继续保留。

密码仅保存在私有内容库与私有构建环境。文章正文和相册清单使用原有客户端加密，
密码不会进入公开列表数据；相册 `info.json` 在构建后移除。
图片仍遵循原静态资源架构，已发布图片的已知地址可以直接访问。
不应把 GitHub、评论服务或服务器访问凭据写入内容笔记。

## 自动化及维护

公开主题 CI 使用无私人数据的夹具，成功后通过独立 deploy key 写入主题版本标记。
私有内容仓负责正式检查、构建、制品及部署，锁定两仓提交。
音乐工作流通过同仓 `repository_dispatch` 触发发布。
服务器的 `shirone-cms-scheduler.timer` 以独立系统用户运行，重启后补查逾期计划。
两套内容写入密钥及站点部署密钥可独立撤销；PR 不会获得内容写入凭据。

Git 同步先保存本机提交，再拉取远端并尝试 rebase。冲突时中止 rebase，保留本机提交
与远端版本，暂停同步。解决冲突后点击“恢复同步”；禁止 force push。
错误详细信息只写入本机被忽略的插件日志，公开界面显示简要原因。

开发者命令：

```powershell
node tools/cms/cli.mjs state ../Shirone-Zh-Content
node tools/cms/cli.mjs validate ../Shirone-Zh-Content
node scripts/content/sync.mjs --production
node tools/cms/build.mjs ../Shirone-Zh-Content/.obsidian/plugins/shirone-cms
node --test tests/content/cms.test.mjs tests/deploy/workflow.test.mjs
python -m unittest discover -s tests/content -p test_cms_scheduler.py
```

更新插件后在 Obsidian 执行 `plugin:reload id=shirone-cms`，或重启 Obsidian。
恢复数据优先使用 Git 历史或 Obsidian 回收站。部署回滚继续使用现有服务器发布工具；
需要恢复旧内容且重新应用当前时间窗口时，应恢复笔记后重新同步发布。
