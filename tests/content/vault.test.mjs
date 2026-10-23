import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { compileVault, noteText, readRecords, visible, instant, files } from "../../tools/vault/core.mjs";
import { verifyPrivateOutput } from "../../tools/vault/verify-dist.mjs";

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
