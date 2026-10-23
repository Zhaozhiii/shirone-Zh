import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { noteText } from "./core.mjs";
const root=resolve(process.argv[2] || "artifacts/vault-fixture");
mkdirSync(root,{recursive:true});
writeFileSync(join(root,"About.md"),noteText({type:"page",key:"about",publish:true},"Public theme fixture.\n"));
writeFileSync(join(root,"Private.md"),noteText({type:"article",publish:false},"PRIVATE_VAULT_FIXTURE_MUST_NOT_LEAK\n"));
console.log("Public-only test fixture ready");
