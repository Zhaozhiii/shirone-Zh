import assert from "node:assert/strict";
import { test } from "node:test";
import { announcementLink } from "../../src/utils/announcement-link.ts";

test("only the exact blog host navigates internally, preserving queries and fragments", () => {
  const site="https://blog.zhiii.top/";
  for(const href of ["https://blog.zhiii.top/about/?a=1#me","/about/?a=1#me","//blog.zhiii.top/about/?a=1#me","http://blog.zhiii.top/about/?a=1#me"])
    assert.deepEqual(announcementLink(href,site),{href:"/about/?a=1#me",external:false});
  for(const href of ["https://zhiii.top/","https://www.zhiii.top/about/","https://other.zhiii.top/","https://blog.zhiii.top.evil.example/","https://example.com/","//zhiii.top/about/"])
    assert.deepEqual(announcementLink(href,site),{href,external:true});
  assert.equal(announcementLink("https://theme.example/about/","https://theme.example/").external,false);
});
