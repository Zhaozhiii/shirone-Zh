import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { compileVault, noteText, readRecords, visible, instant, files } from "../../tools/vault/core.mjs";
import { verifyPrivateOutput } from "../../tools/vault/verify-dist.mjs";
import { migrate } from "../../tools/vault/migrate.mjs";
import { parse } from "yaml";

function fixture(t) {
  const temp=mkdtempSync(join(tmpdir(),"native-vault-"));
  t.after(()=>rmSync(temp,{recursive:true,force:true}));
  const source=join(temp,"notes"),root=join(temp,"theme");
  mkdirSync(source);mkdirSync(root);
  const write=(path,text)=>{const p=join(source,path);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,text);};
  const note=(path,data,body="")=>write(path,noteText(data,body));
  const build=()=>compileVault({sourceRoot:source,root,production:true,previewAt:"2026-10-24T08:00:00+08:00"});
  return {source,root,write,note,build};
}

test("announcement home opt-in supports multiple entries and shares board content and links", t => {
  const {root,note,build}=fixture(t);
  const base={type:"announcement",publish:true,date:"2026.10.24 3:4:5"};
  note("a.md",{...base,title:"首页一",home:true,link:{text:"关于本站",url:"https://example.com/about"}},"第一条正文");
  note("b.md",{...base,title:"首页二",home:true,link:"https://example.com"},"第二条正文");
  note("c.md",{...base,title:"仅铃铛",home:false},"普通公告");
  note("d.md",{...base,title:"默认铃铛"},"默认公告");
  note("e.md",{...base,title:"私有",home:true,publish:false},"PRIVATE_ANNOUNCEMENT");
  note("f.md",{...base,title:"未来",home:true,publishAt:"2026.10.25"},"FUTURE_ANNOUNCEMENT");
  note("g.md",{...base,title:"过期",home:true,unpublishAt:"2026.10.24"},"EXPIRED_ANNOUNCEMENT");
  build();
  const config=parse(readFileSync(join(root,".vault-cache/config/announcement.yaml"),"utf8"));
  assert.deepEqual(config.homeItems.map(x=>x.title),["首页一","首页二"]);
  assert.equal(config.board.items.length,4);
  assert.deepEqual(config.homeItems,config.board.items.slice(0,2));
  assert.equal(config.homeItems[0].date,"2026-10-24 03:04:05");
  assert.deepEqual(config.homeItems[0].link,{text:"关于本站",url:"https://example.com/about"});
  assert.deepEqual(config.homeItems[1].link,{text:"首页二",url:"https://example.com"});
  assert.doesNotMatch(JSON.stringify(config),/PRIVATE_ANNOUNCEMENT|FUTURE_ANNOUNCEMENT|EXPIRED_ANNOUNCEMENT/);
  note("a.md",{...base,title:"首页一",home:false},"修改后正文");
  note("b.md",{...base,title:"首页二",publish:false},"已撤回");
  build();
  const changed=parse(readFileSync(join(root,".vault-cache/config/announcement.yaml"),"utf8"));
  assert.deepEqual(changed.homeItems,[]);
  assert.equal(changed.board.items.length,3);
  assert.equal(changed.board.items[0].content,"修改后正文");
});

test("home must be a boolean and an empty native list overrides legacy demo content", t => {
  const {root,note,build}=fixture(t);
  mkdirSync(join(root,"site/config"),{recursive:true});
  writeFileSync(join(root,"site/config/announcement.yaml"),'content: Legacy demo\n');
  note("a.md",{type:"announcement",publish:true,title:"公告",home:"false"},"正文");
  assert.throws(build,/同时推送到首页必须为开关/);
  note("a.md",{type:"announcement",publish:true,title:"公告"},"正文");
  build();
  const config=parse(readFileSync(join(root,".vault-cache/config/announcement.yaml"),"utf8"));
  assert.deepEqual(config.homeItems,[]);
  assert.equal(config.board.items.length,1);
});
test("only literal publish=true and a supported type can publish, in any natural folder",t=>{
  const {root,note,build}=fixture(t);
  for(const [i,data] of [{type:"article"},{type:"article",publish:false},{type:"article",publish:"true"},{publish:true},{type:"note",publish:true},{type:"constructor",publish:true}].entries()) note(`个人笔记/${i}.md`,data,"PRIVATE_SENTINEL_CONTENT");
  note("学习/公开.md",{type:"article",publish:true,slug:"stable"},"Public text");
  build();
  assert.equal(files(join(root,"src/content/posts")).length,1);
  assert.match(readFileSync(join(root,"src/content/posts/stable.md"),"utf8"),/Public text/);
  assert.doesNotMatch(files(root).map(p=>readFileSync(p,"utf8")).join(""),/PRIVATE_SENTINEL_CONTENT/);
});
test("attachments are resolved relatively or by unique name, hashed and deduplicated; private siblings are absent",t=>{
  const {root,write,note,build}=fixture(t);
  write("附件/图片.png","PUBLIC_IMAGE_BYTES");write("附件/copy.png","PUBLIC_IMAGE_BYTES");write("附件/private.png","PRIVATE_IMAGE_BYTES");
  note("学习/公开.md",{type:"article",publish:true,slug:"post",cover:"[[图片.png]]"},"![[图片.png|300]]\n\n![图](../附件/copy.png)\n\n`![[private.png]]`\n\n```md\n![[private.png]]\n```\n");
  build();
  const text=readFileSync(join(root,"src/content/posts/post.md"),"utf8");
  assert.match(text,/\/images\/vault\/[a-f0-9]{64}\.png/);
  assert.match(text,/`!\[\[private.png\]\]`/);
  assert.equal(files(join(root,"public/images/vault")).length,1);
  assert.equal(readFileSync(files(join(root,"public/images/vault"))[0],"utf8"),"PUBLIC_IMAGE_BYTES");
});
test("wiki links resolve public notes and never transclude private Markdown",t=>{
  const {root,note,build}=fixture(t);
  note("个人笔记/私人.md",{},"PRIVATE_BODY_NEVER_PUBLISH_THIS");
  note("学习/A.md",{type:"article",publish:true,slug:"a"},"[[B|下一篇]] [[私人|补充笔记]]");
  note("学习/B.md",{type:"article",publish:true,slug:"b"},"B");build();
  const text=readFileSync(join(root,"src/content/posts/a.md"),"utf8");
  assert.match(text,/\[下一篇\]\(\/posts\/b\/\)/);assert.match(text,/补充笔记/);assert.doesNotMatch(text,/PRIVATE_BODY|私人\.md/);
  note("学习/A.md",{type:"article",publish:true,slug:"a"},"![[私人.md]]");assert.throws(build);
});
test("withdrawal and file deletion remove old pages, adapters and exclusive assets",t=>{
  const {source,root,write,note,build}=fixture(t);
  write("附件/public.svg","<svg/>");
  note("博客/公开.md",{type:"article",publish:true,slug:"old",cover:"[[public.svg]]"},"Old public article");
  note("设备/手机.md",{type:"device",publish:true,name:"Phone"},"Phone description");
  build();assert.ok(existsSync(join(root,"src/content/posts/old.md")));
  note("博客/公开.md",{type:"article",publish:false,slug:"old"},"PRIVATE_AFTER_WITHDRAWAL");rmSync(join(source,"设备/手机.md"));
  build();assert.equal(existsSync(join(root,"src/content/posts/old.md")),false);assert.equal(files(join(root,"public/images/vault")).length,0);
  assert.doesNotMatch(readFileSync(join(root,"src/data/devices.ts"),"utf8"),/Phone description/);
});
test("time windows use Shanghai local times, include start, exclude end",t=>{
  assert.equal(instant("2026-10-24T08:00"),"2026-10-24T00:00:00.000Z");
  const d={publish:true,publishAt:"2026-10-24T08:00",unpublishAt:"2026-10-24T09:00"};
  assert.equal(visible(d,"2026-10-24T00:00:00.000Z"),true);assert.equal(visible(d,"2026-10-24T01:00:00.000Z"),false);
  const {root,note,build}=fixture(t);
  note("future.md",{type:"article",publish:true,publishAt:"2026-10-25T08:00",slug:"future"},"Future");
  note("expired.md",{type:"article",publish:true,unpublishAt:"2026-10-24T08:00",slug:"expired"},"Expired");
  build();assert.equal(files(join(root,"src/content/posts")).length,0);
});

test("publication normalizes ISO and shorthand timestamps while keeping article calendar dates", t => {
  const { root, note, build } = fixture(t);
  note("动态/上线.md", {type:"moment", publish:true, slug:"launch", published:"2026-10-24T06:30:00+08:00"}, "Launch");
  build();
  assert.match(readFileSync(join(root,"src/content/moments/launch.md"),"utf8"), /published: 2026-10-24T06:30:00\+08:00/);
  note("动态/上线.md", {type:"moment", publish:true, slug:"launch", published:"2026-10-24T06:30:45+08:00"}, "Launch");
  build();
  assert.match(readFileSync(join(root,"src/content/moments/launch.md"),"utf8"), /published: 2026-10-24T06:30:45\+08:00/);
  for (const published of ["2026-10-24 06:30", "2026-10-24T06:30", "2026-10-24T06:30:00"]) {
    note("动态/上线.md", {type:"moment", publish:true, slug:"launch", published}, "Launch");
    build();
    assert.match(readFileSync(join(root,"src/content/moments/launch.md"),"utf8"), /published: 2026-10-24T06:30:00\+08:00/);
  }
  note("动态/上线.md", {type:"moment", publish:true, published:"2026-02-30T06:30:00+08:00"}, "Invalid");
  assert.throws(build, /日期无效/);
  note("动态/上线.md", {type:"moment", publish:false}, "Private");
  note("文章.md", {type:"article", publish:true, slug:"article", published:"2026.10.24 6:3:5"}, "Article");
  build();
  const article = readFileSync(join(root,"src/content/posts/article.md"),"utf8");
  assert.match(article, /published: 2026-10-24\n/);
  assert.match(article, /publishedAt: 2026-10-24T06:03:05\+08:00/);
});

test("time-only publication uses the note date rather than the build day", t => {
  const { source, root, note } = fixture(t);
  note("动态/上线.md", {type:"moment", publish:true, slug:"launch", created:"2026.10.20", published:"3:13:15", publishAt:"3:0:0"}, "Launch");
  for (const previewAt of ["2026-10-24T08:00:00+08:00", "2026-10-25T08:00:00+08:00"]) {
    compileVault({sourceRoot:source,root,production:true,previewAt});
    assert.match(readFileSync(join(root,"src/content/moments/launch.md"),"utf8"), /published: 2026-10-20T03:13:15\+08:00/);
  }
});

test("private unfinished time Properties cannot block another note's publication", t => {
  const { root, note, build } = fixture(t);
  note("草稿.md", {type:"moment", publish:false, published:"暂未确定", publishAt:"3:13:15", unpublishAt:"还没想好"}, "PRIVATE_UNFINISHED_TIME");
  note("公开.md", {type:"article", publish:true, slug:"public", published:"2026.1.2"}, "Public");
  build();
  assert.match(readFileSync(join(root,"src/content/posts/public.md"),"utf8"), /Public/);
  assert.equal(files(join(root,"src/content/moments")).length, 0);
});

test("date is optional display metadata independent of publication windows", t => {
  const {root,note,build}=fixture(t);
  note("无日期.md",{type:"article",publish:true,slug:"undated"},"No date");
  note("日期.md",{type:"article",publish:true,slug:"dated",date:"2026.1.2"},"Date only");
  note("时间.md",{type:"moment",publish:true,slug:"timed",date:"2026.1.2 3:4:5"},"Time");
  note("空动态.md",{type:"moment",publish:true,slug:"empty",date:""},"No date");
  note("时区.md",{type:"article",publish:true,slug:"zoned",date:"2026-01-01T22:04:05Z"},"Time zone");
  build();
  assert.match(readFileSync(join(root,"src/content/posts/undated.md"),"utf8"), /displayDate: ""/);
  assert.match(readFileSync(join(root,"src/content/posts/dated.md"),"utf8"), /displayDate: "2026-01-02"/);
  assert.match(readFileSync(join(root,"src/content/moments/timed.md"),"utf8"), /displayDate: "2026-01-02 03:04:05"/);
  assert.match(readFileSync(join(root,"src/content/moments/empty.md"),"utf8"), /displayDate: ""/);
  assert.match(readFileSync(join(root,"src/content/posts/zoned.md"),"utf8"), /published: 2026-01-02\n/);
  assert.match(readFileSync(join(root,"src/content/posts/zoned.md"),"utf8"), /displayDate: "2026-01-02 06:04:05"/);
  note("日期.md",{type:"article",publish:true,slug:"dated",date:"2026.1.2",publishAt:"2026.10.25 3:4:5"},"Scheduled");
  build();
  assert.equal(existsSync(join(root,"src/content/posts/dated.md")),false);
});

test("announcement date and simple link compile without requiring schedule Properties", t => {
  const {root,note,build}=fixture(t);
  note("公告.md",{type:"announcement",publish:true,title:"Notice",date:"2026.1.2 3:4:5",link:"https://example.com"},"Notice body");
  build();
  const output = readFileSync(join(root,".vault-cache/config/announcement.yaml"),"utf8");
  assert.match(output,/2026-01-02 03:04:05/);
  assert.match(output,/url: https:\/\/example.com/);
  note("公告.md",{type:"announcement",publish:true,title:"Notice",date:"",link:""},"Notice body");
  build();
  assert.doesNotMatch(readFileSync(join(root,".vault-cache/config/announcement.yaml"),"utf8"),/2026-01-02/);
});
test("moving and retitling a note preserves its explicit slug; duplicates fail",t=>{
  const {source,root,note,build}=fixture(t);
  note("old.md",{type:"article",publish:true,slug:"stable",title:"Old"},"Body");build();
  renameSync(join(source,"old.md"),join(source,"moved.md"));note("moved.md",{type:"article",publish:true,slug:"stable",title:"New"},"Body");build();
  assert.match(readFileSync(join(root,"src/content/posts/stable.md"),"utf8"),/title: New/);
  note("duplicate.md",{type:"article",publish:true,slug:"stable"},"Duplicate");assert.throws(build,/Duplicate|重复/);
});
test("missing and ambiguous attachments fail closed before changing existing output",t=>{
  const {root,write,note,build}=fixture(t);
  note("a.md",{type:"article",publish:true,slug:"a"},"Valid content");build();
  note("a.md",{type:"article",publish:true,slug:"a"},"![[missing.png]]");assert.throws(build,/missing|ambiguous/);
  assert.match(readFileSync(join(root,"src/content/posts/a.md"),"utf8"),/Valid content/);
  write("one/a.png","a");write("two/a.png","b");note("a.md",{type:"article",publish:true,slug:"a"},"![[a.png]]");assert.throws(build,/ambiguous/);
});
test("non-note resources cannot escape the Vault or copy Markdown as attachments",t=>{
  const {note,write,build}=fixture(t);
  write("private.md","PRIVATE_BODY");
  for(const body of ["![[private.md]]","![x](../outside.png)","@include: ../../private.md","@[code-tree](../notes)",'::code-tree{dir="src/content/posts"}',':::code-tree{dir="src/content/posts"}\n:::']) {
    note("a.md",{type:"article",publish:true,slug:"a"},body);assert.throws(build);
  }
});
test("templates never publish and a dry-run leaves both Vault and build inputs intact",t=>{
  const {source,root,note}=fixture(t);
  note("模板/template.md",{type:"article",publish:true},"TEMPLATE");
  const before=files(source).map(p=>[p,readFileSync(p,"utf8")]);
  compileVault({sourceRoot:source,root,dryRun:true});
  assert.deepEqual(files(source).map(p=>[p,readFileSync(p,"utf8")]),before);assert.equal(files(root).length,0);
});
test("simple device, link, friend, project and media notes get safe field defaults",t=>{
  const {root,note,build}=fixture(t);
  note("d.md",{type:"device",publish:true},"设备介绍");note("l.md",{type:"link",publish:true,url:"https://example.com",group:"研究"},"说明");
  note("f.md",{type:"friend",publish:true,url:"https://example.com"},"友链介绍");note("p.md",{type:"project",publish:true},"项目介绍");
  note("m.md",{type:"movie",publish:true},"## 影评\n\n电影正文");build();
  assert.match(readFileSync(join(root,"src/data/devices.ts"),"utf8"),/设备介绍/);
  assert.match(readFileSync(join(root,"src/data/compass.ts"),"utf8"),/研究/);
  assert.match(readFileSync(join(root,"src/content/spec/media/m.md"),"utf8"),/电影正文/);
});
test("secret references fail closed and private fields never enter public structured data",t=>{
  const {root,note,build}=fixture(t);
  note("a.md",{type:"article",publish:true,encrypted:true,passwordSecret:"VAULT_TEST_PASSWORD",slug:"a"},"Protected body");assert.throws(build,/unavailable/);
  process.env.VAULT_TEST_PASSWORD="temporary-password-for-test";
  t.after(()=>delete process.env.VAULT_TEST_PASSWORD);build();
  assert.doesNotMatch(readFileSync(join(root,"src/content/posts/a.md"),"utf8"),/passwordSecret/);
  note("d.md",{type:"device",publish:true,privateMemo:"NEVER_EXPORT_THIS",password:"DO_NOT_EXPORT"},"Public description");build();
  assert.doesNotMatch(readFileSync(join(root,"src/data/devices.ts"),"utf8"),/NEVER_EXPORT|DO_NOT_EXPORT/);
});
test("release verification detects a private body or password without printing it",t=>{
  const {source,root,note}=fixture(t);
  note("private.md",{type:"article",publish:false},"This is a long unique private body sentinel.");
  writeFileSync(join(root,"page.html"),"This is a long unique private body sentinel.");
  assert.throws(()=>verifyPrivateOutput(source,root),/Private content/);
});

test("invalid private YAML remains private without blocking unrelated publication",t=>{
  const {write,note,build}=fixture(t);
  write("unfinished.md","---\ntags: [unfinished\n---\nPrivate editing in progress");
  note("public.md",{type:"article",publish:true,slug:"public"},"Public body");
  assert.doesNotThrow(build);
  write("unfinished.md","---\ntype: article\npublish: true\ntags: [unfinished\n---\nBody");
  assert.throws(build,/invalid YAML/);
});

test("an empty public Vault retains directory contracts used by theme tooling",t=>{
  const {root,build}=fixture(t);build();
  for(const path of ["public/images/albums","public/images/vault","src/content/posts","src/content/moments","src/content/spec"]) assert.ok(existsSync(join(root,path)));
});

test("legacy migration preserves relative article images and splits navigation groups without copying unused assets",t=>{
  const {source,root,write}=fixture(t),vault=join(root,"../migrated");
  write("content/posts/original/index.md",noteText({title:"Original",published:"2026-10-24",draft:false},"![图](./image.png)"));
  write("content/posts/original/image.png","IMAGE_BYTES");write("public/unused.mp3","UNUSED_AUDIO");
  write("assets/images/avatar.png","BRANDING_BYTES");write("config/profile.yaml","avatar: assets/images/avatar.png\n");
  write("cms/compass/links.md",noteText({name:"Research",key:"research",entries:[{label:"Example",href:"https://example.com"}]}));
  mkdirSync(vault);migrate(source,vault,root);
  assert.equal(files(vault).filter(p=>p.endsWith(".mp3")).length,0);
  assert.equal(files(join(root,"site/assets/images")).length,1);
  compileVault({sourceRoot:vault,root});
  assert.match(readFileSync(join(root,"src/content/posts/original.md"),"utf8"),/\/images\/vault\/[a-f0-9]+\.png/);
  assert.match(readFileSync(join(root,"src/data/compass.ts"),"utf8"),/Research/);
  assert.throws(()=>migrate(source,vault,root),/empty Vault/);
});

test("native prose edits update website cards even when an old description property remains",t=>{
  const {root,note,build}=fixture(t);
  note("device.md",{type:"device",publish:true,description:"OLD_DESCRIPTION"},"NEW_NATIVE_BODY");
  note("project.md",{type:"project",publish:true,summary:"OLD_SUMMARY"},"NEW_PROJECT_BODY");
  build();
  assert.match(readFileSync(join(root,"src/data/devices.ts"),"utf8"),/NEW_NATIVE_BODY/);
  assert.doesNotMatch(readFileSync(join(root,"src/data/devices.ts"),"utf8"),/OLD_DESCRIPTION/);
  assert.match(readFileSync(join(root,"src/data/projects.ts"),"utf8"),/NEW_PROJECT_BODY/);
});

test("ordinary Chinese titles with spaces get usable default article and album URLs",t=>{
  const {root,note,build}=fixture(t);
  note("YOLO 学习.md",{type:"article",publish:true},"学习正文");
  note("我的 相册.md",{type:"album",publish:true,photos:[]},"相册正文");
  build();
  assert.ok(existsSync(join(root,"src/content/posts/YOLO-学习.md")));
  assert.ok(existsSync(join(root,"public/images/albums/我的-相册/info.json")));
});

test("a public album defaults to its first photo when no cover property is supplied",t=>{
  const {root,write,note,build}=fixture(t);
  write("附件/photo.png","PHOTO_BYTES");
  note("album.md",{type:"album",publish:true,key:"album",photos:[{src:"附件/photo.png"}]});
  build();
  const info=JSON.parse(readFileSync(join(root,"public/images/albums/album/info.json"),"utf8"));
  assert.match(info.cover,/^\/images\/vault\/[a-f0-9]+\.png$/);
  assert.equal(info.cover,info.photos[0].src);
});

test("album photos can be written as native Markdown with no YAML photo list",t=>{
  const {root,write,note,build}=fixture(t);
  write("附件/a.png","PHOTO_A");write("附件/b.png","PHOTO_B");
  note("album.md",{type:"album",publish:true,key:"native"},"相册介绍\n\n![[a.png]]\n\n![第二张](附件/b.png)\n\n`![[private.png]]`");
  build();const info=JSON.parse(readFileSync(join(root,"public/images/albums/native/info.json"),"utf8"));
  assert.equal(info.photos.length,2);assert.ok(info.cover);assert.equal(info.photos[1].alt,"第二张");
});
