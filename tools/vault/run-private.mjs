/** Capture tool output: neither Markdown bodies nor schema values belong in Actions logs. */
import { spawnSync } from "node:child_process";
const commands={
  materialize:[process.execPath,["scripts/content/sync.mjs","--production"]],
  check:[process.execPath,["node_modules/astro/bin/astro.mjs","check"]],
  build:[process.platform==="win32"?"pnpm.cmd":"pnpm",["build"]],
  verify:[process.execPath,["tools/vault/verify-dist.mjs",process.env.CONTENT_DIR,"dist"]],
};
const key=process.argv[2];
if(!commands[key])throw new Error("Unknown private build phase");
const [command,args]=commands[key];
const result=spawnSync(command,args,{stdio:"pipe",encoding:"utf8",maxBuffer:64*1024*1024,windowsHide:true});
if(result.status!==0){
  console.error(`The ${key} phase failed. Current website and original notes are unchanged. Review the latest public note Properties and attachment references locally.`);
  process.exit(1);
}
console.log(`Private ${key} phase passed; source output suppressed.`);
