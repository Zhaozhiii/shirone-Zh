import { expect, test } from "@playwright/test";

test("native Vault keeps existing public pages and excludes private content", async ({ request }) => {
  for (const path of ["/", "/about/", "/devices/", "/projects/", "/friends/", "/moments/", "/media/"]) {
    const response=await request.get(path);
    expect(response.ok(),path).toBe(true);
    expect(await response.text()).not.toContain("PRIVATE_VAULT_FIXTURE_MUST_NOT_LEAK");
  }
  expect((await request.get("/albums/HiddenExample/")).status()).toBe(404);
});

test("code-owned branding and whitelist images load",async ({page})=>{
  await page.goto("/",{waitUntil:"domcontentloaded"});
  const image=page.locator('img[src*="avatar"],img[src*="/images/branding/"]').first();
  await expect(image).toBeAttached();
  await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.complete && img.naturalWidth>0)).toBe(true);
});

test("Swup navigation preserves the existing device and project routes",async ({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/devices/",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.documentElement.style.getPropertyValue("--mc-primary").trim().startsWith("#"));
  const link=page.locator('a[href="/projects/"]').first();
  await link.click();
  await expect(page).toHaveURL(/\/projects\/$/);
  await expect(page.locator("#swup-container")).toHaveAttribute("data-current-page","projects");
});
