import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const hash=createHash("sha256");
hash.update(execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim());
const paths=JSON.parse(readFileSync(".vault-cache-files.json","utf8")).sort();
for(const path of paths) {
  try {hash.update(path).update(readFileSync(path));} catch(error) {if(error.code!=="ENOENT")throw error;}
}
console.log(hash.digest("hex"));
