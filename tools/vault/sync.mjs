import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { compileVault, files } from "./core.mjs";
import { syncUserConfig } from "../../scripts/content/config-overlay.mjs";

export function syncVault({root,sourceRoot,commit,dryRun=false}) {
  // Only engineering assets in the code repository can be mounted wholesale.
  if (!dryRun) for (const [from,to] of [["site/assets","src/assets"],["site/public","public"],["site/data","src/data"]]) {
    for (const file of files(join(root,from))) {
      const dest=join(root,to,relative(join(root,from),file));
      mkdirSync(dirname(dest),{recursive:true}); copyFileSync(file,dest);
    }
  }
  const result=compileVault({root,sourceRoot,production:true,dryRun});
  const config=syncUserConfig({root,sourceRoot:dryRun?join(root,"site"):result.configRoot,dryRun,warn:()=>{}});
  const lock={schemaVersion:1,format:"obsidian-vault",source:{type:"path",path:sourceRoot,commit},config:config.files,evaluatedAt:result.time};
  if(!dryRun) {
    writeFileSync(join(root,"content.lock.json"),JSON.stringify(lock,null,2)+"\n");
    // Astro may otherwise retain the last record when a collection becomes empty.
    for(const p of [".astro/data-store.json","node_modules/.astro/data-store.json"]) rmSync(join(root,p),{force:true});
  }
  return lock;
}
