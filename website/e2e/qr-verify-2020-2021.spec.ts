import { test, expect } from "@playwright/test";

test("qui-recoit selector exposes 2018-2024 incl. 2020 and 2021", async ({ page }) => {
  await page.goto("http://localhost:3001/ville/paris/subventions", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/qr-screenshots/qui-recoit-desktop.png", fullPage: false });

  for (const y of ["2018", "2019", "2020", "2021", "2022", "2023", "2024"]) {
    await expect(page.getByText(y, { exact: true }).first()).toBeVisible();
  }
});

test("qui-recoit 2020 click shows CASVP as top beneficiary", async ({ page }) => {
  await page.goto("http://localhost:3001/ville/paris/subventions", { waitUntil: "networkidle" });
  await page.getByText("2020", { exact: true }).first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "/tmp/qr-screenshots/qui-recoit-2020.png", fullPage: false });
  await expect(page.getByText(/CENTRE.*ACTION.*SOCIALE|CASVP/i).first()).toBeVisible();
});

test("qui-recoit mobile renders 2020/2021 selector", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3001/ville/paris/subventions", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/qr-screenshots/qui-recoit-mobile.png", fullPage: false });
  for (const y of ["2020", "2021"]) {
    await expect(page.getByText(y, { exact: true }).first()).toBeVisible();
  }
});
