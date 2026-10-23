import { expect, test } from "@playwright/test";
test.skip(!process.env.VAULT_ACCEPTANCE,"Requires generated notes outside the real Vault");
test("public Markdown and film review render through existing routes",async({request})=>{
  const article=await request.get("/posts/vault-acceptance/");expect(article.ok()).toBe(true);
  expect(await article.text()).toContain("PUBLIC_VAULT_INTEGRATION_BODY");
  const movie=await request.get("/media/vault-movie/");expect(movie.ok()).toBe(true);
  expect(await movie.text()).toContain("PUBLIC_VAULT_MOVIE_DETAIL");
  expect((await request.get("/series/vault-fixture/")).ok()).toBe(true);
});
test("protected body and private notes are absent from plaintext and feeds",async({request})=>{
  const response=await request.get("/posts/vault-locked/");expect(response.ok()).toBe(true);
  expect(await response.text()).not.toContain("PROTECTED_VAULT_BODY_MUST_NOT_BE_PLAINTEXT");
  expect(await response.text()).not.toContain("vault-temporary-test-password-2026");
  for(const path of ["/","/rss.xml","/llms-full.txt","/friends.json","/posts/vault-acceptance/"]) {
    const page=await request.get(path);const text=await page.text();
    expect(text).not.toContain("PRIVATE_VAULT_BODY_MUST_NEVER_BE_EXPORTED");
    expect(text).not.toContain("PROTECTED_VAULT_BODY_MUST_NOT_BE_PLAINTEXT");
  }
  expect((await request.get("/posts/private/")).status()).toBe(404);
});
test("media detail works through Swup",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});await page.goto("/media/");
  await page.getByRole("link",{name:"Vault movie fixture",exact:true}).click();
  await expect(page).toHaveURL(/\/media\/vault-movie\/$/);
  await expect(page.getByRole("heading",{name:"Movie review"})).toBeVisible();
  await expect(page.locator("#swup-container")).toHaveAttribute("data-current-page","media");
});
