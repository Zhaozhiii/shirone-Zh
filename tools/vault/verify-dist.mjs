import { readFileSync } from "node:fs";
import { files, readRecords, readNote, types, visible } from "./core.mjs";
/** Verify release text without printing private values or source paths. */
export function verifyPrivateOutput(source,dist,time=new Date().toISOString()) {
  const records=readRecords(source);
  const tokens=[];
  for(const file of files(source).filter(p=>/\.md$/i.test(p))) {
    let note;
    try {note=readNote(readFileSync(file,"utf8"));} catch {continue;}
    if (!(Object.hasOwn(types,note.data.type) && visible(note.data,time)) && note.body.trim().length>=24) tokens.push(note.body.trim());
  }
  for(const r of records) {
    if(r.data.password)tokens.push(String(r.data.password));
    if(!visible(r.data,time)||r.data.encrypted||r.data.password) {
      if(r.body.trim().length>=24)tokens.push(r.body.trim());
    }
  }
  for(const file of files(dist).filter(p=>/\.(html|json|js|xml|txt|map)$/.test(p))) {
    const text=readFileSync(file,"utf8");
    for(const token of tokens) {
      if(token.length>=12 && (text.includes(token)||text.includes(JSON.stringify(token).slice(1,-1)))) throw new Error("Private content detected in release");
      if(token.length<12 && text.includes('"password":"'+token+'"')) throw new Error("Password detected in release");
    }
  }
}
if(process.argv[2]) {verifyPrivateOutput(process.argv[2],process.argv[3]||"dist");console.log("Release privacy verification passed");}
