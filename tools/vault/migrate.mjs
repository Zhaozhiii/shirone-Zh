/** One-time migration from a legacy CMS working copy; never imports its Git history. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join, relative, resolve, posix, extname } from "node:path";
import { createHash } from "node:crypto";
import { parse, stringify } from "yaml";
import { files, noteText, readNote } from "./core.mjs";
import { domains } from "./model.mjs";

export function migrate(source, vault, theme) {
  source = resolve(source); vault = resolve(vault); theme = resolve(theme);
  if (files(vault).length) throw new Error("Migration requires an empty Vault; existing notes will never be overwritten");
  const write = (path, value) => { mkdirSync(dirname(path), { recursive:true }); writeFileSync(path,value); };
  const assets = new Map();
  for (const folder of ["assets", "public", "cms/media", "content"]) {
    for (const file of files(join(source,folder)).filter(p => !/\.(md|mdx|json|ts|txt)$/.test(p) && !p.endsWith(".gitkeep"))) {
      const old = relative(source,file).replaceAll("\\","/");
      const natural = old.replace(/^public\/images\/albums\//,"相册/")
        .replace(/^public\/images\/moments\//,"动态/")
        .replace(/^public\/assets\/projects\//,"项目/")
        .replace(/^public\/assets\/music\//,"音乐/")
        .replace(/^public\/assets\/anime\//,"影视/")
        .replace(/^(?:assets\/images|cms\/media)\//,"图片/")
        .replace(/^content\/posts\//,"博客/")
        .replace(/^public\/(?:images|assets)\//,"");
      const dest = "附件/"+natural;
      assets.set(old,dest);
      if (old.startsWith("public/")) assets.set("/"+old.slice(7),dest);
      mkdirSync(dirname(join(vault,dest)),{recursive:true});
      copyFileSync(file,join(vault,dest));
    }
  }
  const transform = value => {
    if (typeof value === "string") return assets.get(value) || assets.get(value.replace(/^\//,"")) || value;
    if (Array.isArray(value)) return value.map(transform);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,transform(v)]));
    return value;
  };
  const mapping = {
    posts:["博客","article"],moments:["动态","moment"],media:["影视","media"],devices:["设备","device"],
    projects:["项目","project"],friends:["友链","friend"],skills:["个人笔记/技能","skill"],timeline:["个人笔记/经历","timeline"],
    categories:["分类","category"],tags:["标签","tag"],series:["系列","series"],announcements:["公告","announcement"],
    albums:["相册","album"],anime:["影视/番剧","anime"],compass:["网址","link"],
    aboutTechGroups:["个人笔记/技术","aboutTechGroup"],aboutMilestones:["个人笔记/里程碑","aboutMilestone"],aboutSocialLinks:["个人笔记/社交","aboutSocialLink"],
  };
  const counts = {};
  for (const [domain,schema] of Object.entries(domains)) {
    for (const file of files(join(source,schema.folder || `cms/${domain}`)).filter(p=>p.endsWith(".md"))) {
      const note = readNote(readFileSync(file,"utf8"));
      const [folder,type] = mapping[domain];
      const oldPath = relative(source,file).replaceAll("\\","/");
      const originalId = oldPath.slice((schema.folder || `cms/${domain}`).length+1).replace(/\.md$/,"");
      const data = transform(note.data);
      data.type = type;
      if(domain === "albums" && !data.cover) {
        const cover=["webp","jpg","png"].map(ext=>`public/images/albums/${data.key}/cover.${ext}`).find(path=>assets.has(path));
        if(cover)data.cover=assets.get(cover);
      }
      // Preserve the author's explicit draft/visibility choices, including future windows.
      data.publish = data.draft !== true && data.visible !== false;
      data.slug ??= data.alias || (domain === "posts" ? originalId.replace(/\/index$/,"") : data.key || data.cmsId || originalId);
      delete data.cmsId; delete data.draft; delete data.visible;
      let body = note.body;
      // Resolve old relative image paths before moving a note to its natural folder.
      body = body.replace(/(!\[[^\]]*\]\()([^\s)]+)(\))/g, (match,a,url,z) => {
        const target=assets.get(posix.normalize(posix.join(posix.dirname(oldPath),url))) || assets.get(url);
        return target ? a+target+z : match;
      });
      if (domain === "compass") {
        for (const [index,entry] of (data.entries || []).entries()) {
          write(join(vault,folder,`${originalId}-${index}.md`),noteText({type:"link",publish:data.publish,title:entry.label,url:entry.href,group:data.name,icon:entry.icon,cover:entry.image,description:entry.note,order:data.order || 0}));
          counts.links=(counts.links||0)+1;
        }
        continue;
      }
      // Existing album/structured data is kept verbatim in Properties; prose belongs in the body.
      if (["devices","projects","friends","media","announcements","skills","timeline","anime"].includes(domain)) {
        const field = {devices:"description",projects:"summary",friends:"desc",media:"description",announcements:"content",skills:"description",timeline:"description",anime:"description"}[domain];
        if (!body.trim()) body = String(data[field] || "");
        if (body.trim() === String(data[field] || "").trim()) delete data[field];
      }
      const name = String(data.title || data.name || originalId).replace(/[<>:"/\\|?*\x00-\x1f]/g,"-").replace(/[. ]+$/,"");
      let target = join(vault,folder,name+".md");
      if (existsSync(target)) target=join(vault,folder,name+"-"+originalId.replaceAll("/","-")+".md");
      write(target,noteText(data,body)); counts[domain]=(counts[domain]||0)+1;
    }
  }
  for (const file of files(join(source,"content/spec")).filter(p=>p.endsWith(".md"))) {
    const key = relative(join(source,"content/spec"),file).replace(/\.md$/,"");
    const note = readNote(readFileSync(file,"utf8"));
    write(join(vault,"个人笔记/关于",key+".md"), noteText({...transform(note.data),type:"page",key,publish:true},note.body));
    counts.pages=(counts.pages||0)+1;
  }
  function configValue(value) {
    if(Array.isArray(value))return value.map(configValue);
    if(value && typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,configValue(v)]));
    if(typeof value!=="string")return value;
    const mapped=assets.get(value) || assets.get(value.replace(/^\//,""));
    if(!mapped)return value;
    const file=join(vault,mapped),bytes=readFileSync(file);
    if(value.startsWith("assets/")) {
      const dest=join(theme,"site",value);mkdirSync(dirname(dest),{recursive:true});copyFileSync(file,dest);
      return value;
    }
    const url="images/branding/"+createHash("sha256").update(bytes).digest("hex")+extname(file);
    const dest=join(theme,"site/public",url);mkdirSync(dirname(dest),{recursive:true});copyFileSync(file,dest);
    return "/"+url;
  }
  for (const file of files(join(source,"config")).filter(p=>/\.(ya?ml|html)$/.test(p))) {
    const dest = join(theme,"site/config",relative(join(source,"config"),file));
    write(dest,/\.ya?ml$/.test(file)?stringify(configValue(parse(readFileSync(file,"utf8")))):readFileSync(file));
  }
  // The music generator and snapshots are engineering data, maintained only in the code repository.
  const music=join(source,"data/music.ts");
  if(existsSync(music)) write(join(theme,"site/data/music.ts"),readFileSync(music));
  for(const folder of [".github/scripts"])
    for(const file of files(join(source,folder))) write(join(theme,relative(source,file)),readFileSync(file));
  if(existsSync(join(source,".github/music-playlist-state.json"))) write(join(theme,".github/music-playlist-state.json"),readFileSync(join(source,".github/music-playlist-state.json")));
  // The source still holds the complete recovery copy. A new Vault only needs referenced attachments.
  const text=files(vault).filter(p=>p.endsWith(".md")).map(p=>readFileSync(p,"utf8")).join("\n");
  let retained=0;
  for(const path of new Set(assets.values())) {
    const name=posix.basename(path).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    if(text.includes(path) || new RegExp(`(?<![\\p{L}\\p{N}_])${name}(?![\\p{L}\\p{N}_])`,"u").test(text))retained++;
    else unlinkSync(join(vault,path));
  }
  console.log(JSON.stringify({migrated:counts,attachments:retained}));
  return counts;
}
if (process.argv[2]) migrate(...process.argv.slice(2,5));
