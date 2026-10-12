import { test, expect } from "@playwright/test";
import path from "node:path";
const file = (name: string) => path.resolve("tests/fixtures/" + name);
test.setTimeout(120000);
test("imports real files, plays, persists, reads, generates offline speech, and restores backup", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !/^http:\/\/(127\.0\.0\.1|localhost):/.test(r.url())
    )
      external.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your next chapter awaits." }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  await page
    .getByRole("button", { name: "Add books", exact: true })
    .first()
    .click();
  await page
    .locator("input[type=file]")
    .setInputFiles([
      file("Quiet Garden.wav"),
      file("Garden.epub"),
      file("Garden.pdf"),
    ]);
  await expect(
    page.getByText("Ready to listen", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Ready to read", { exact: true })).toHaveCount(2);
  await page.locator("input[type=file]").setInputFiles(file("Garden.epub"));
  await expect(
    page.locator(".upload-job").getByText(/exact file is already/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Go to my library" }).click();
  await page
    .getByRole("button", { name: "Quiet Garden Unknown author", exact: true })
    .filter({ has: page.locator("h3") })
    .click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await page
    .getByRole("button", { name: "Play audiobook", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause audiobook" }),
  ).toBeVisible();
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "Pause audiobook" }).click();
  await page.getByRole("slider", { name: "Seek chapter" }).fill("4");
  await page.getByRole("button", { name: "Bookmark", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Open full player" }).click();
  await expect(page.getByRole("slider", { name: "Seek chapter" })).toHaveValue(
    "4",
  );
  await page
    .getByRole("button", { name: "My library", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "The Quiet Garden", exact: false })
    .filter({ has: page.locator("h3") })
    .click();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect(page.locator(".reader-content")).toContainText(
    "A good story begins",
  );
  await page
    .getByRole("combobox", { name: "Reading chapter" })
    .selectOption("1");
  await expect(page.locator(".reader-content")).toContainText(
    "Another chapter",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "My library", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "The Quiet Garden", exact: false })
    .filter({ has: page.locator("h3") })
    .click();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Reading chapter" }),
  ).toHaveValue("1");
  await page
    .getByRole("button", { name: "Voice studio", exact: false })
    .first()
    .click();
  await expect(page.getByText("Local companion connected")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Voice", exact: true })
    .selectOption("espeak-en-us");
  await page.getByRole("button", { name: "Generate audiobook" }).click();
  await expect(page.getByText("Narration saved to your library")).toBeVisible({
    timeout: 60000,
  });
  await page
    .getByRole("button", { name: "My library", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Voice studio", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("combobox", { name: "Voice", exact: true }),
  ).toHaveValue("espeak-en-us");
  await page
    .getByRole("button", { name: "Storage manager", exact: true })
    .click();
  const [backup] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export full backup" }).click(),
  ]);
  const backupPath = await backup.path();
  expect(backupPath).toBeTruthy();
  page.on("dialog", (d) => d.accept());
  await page.locator("input[type=file]").setInputFiles(backupPath!);
  await expect(
    page.getByText("Backup restored", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller !== null),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your next chapter awaits." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "My library", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Garden", exact: false })
    .filter({ has: page.locator("h3") })
    .filter({ hasNotText: "Quiet" })
    .click();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect(page.locator(".reader-content")).toContainText("A quiet garden");
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
test("mobile navigation and persistent settings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByText("Accent color", { exact: true })
    .locator("input")
    .fill("#794c46");
  await page
    .getByText("Skip interval (seconds)", { exact: true })
    .locator("input")
    .fill("30");
  await page.reload();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByText("Skip interval (seconds)", { exact: true }).locator("input"),
  ).toHaveValue("30");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-settings.png",
    fullPage: true,
  });
});
test("M4B chapters, collections, notes, real listening statistics, and sleep timer", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add books", exact: true })
    .first()
    .click();
  await page.locator("input[type=file]").setInputFiles(file("Garden.m4b"));
  await expect(
    page.getByText("Ready to listen", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Go to my library" }).click();
  await page
    .getByRole("button", {
      name: "Garden with chapters Ada Rivers",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Morning", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Evening", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await page.getByRole("button", { name: "Play audiobook" }).click();
  await page.waitForTimeout(1300);
  await page.getByRole("combobox", { name: "Sleep timer" }).selectOption("-1");
  await page.getByRole("slider", { name: "Seek chapter" }).fill("5.8");
  await expect(page.locator(".chapter-label")).toContainText("Evening");
  await expect(
    page.getByRole("button", { name: "Play audiobook" }),
  ).toBeVisible();
  await expect(page.getByRole("slider", { name: "Seek chapter" })).toHaveValue(
    "0",
  );
  await page.getByRole("button", { name: "Play audiobook" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Pause audiobook" }).click();
  page.once("dialog", (d) => d.accept("A wonderful chapter"));
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByRole("button", { name: "Bookmarks & notes" }).click();
  await expect(
    page.getByText("A wonderful chapter", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept("Evening stories"));
  await page
    .getByRole("button", { name: "Collections", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "New collection" }).click();
  await expect(
    page.getByRole("heading", { name: "Evening stories" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Listening insights" }).click();
  await expect(
    page.getByRole("heading", { name: "Listening insights." }),
  ).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const request = indexedDB.open("folio");
      const db = await new Promise<IDBDatabase>(
        (r) => (request.onsuccess = () => r(request.result)),
      );
      const result = db
        .transaction("activity")
        .objectStore("activity")
        .getAll();
      return await new Promise<number>(
        (r) =>
          (result.onsuccess = () =>
            r(result.result.reduce((n, a) => n + a.seconds, 0))),
      );
    }),
  ).toBeGreaterThan(0);
});
test("optional silence detection advances through actual silent PCM", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "Skip detected silence (experimental)",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Add books", exact: true })
    .first()
    .click();
  await page.locator("input[type=file]").setInputFiles(file("Silence.wav"));
  await expect(
    page.getByText("Ready to listen", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Go to my library" }).click();
  await page
    .getByRole("button", { name: "Silence Unknown author", exact: true })
    .click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await page.getByRole("button", { name: "Play audiobook" }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Pause audiobook" }).click();
  expect(
    Number(
      await page.getByRole("slider", { name: "Seek chapter" }).inputValue(),
    ),
  ).toBeGreaterThan(3);
});
test("chapter editing splits real ranges, reorders them, and removes a chapter safely", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add books", exact: true })
    .first()
    .click();
  await page.locator("input[type=file]").setInputFiles(file("Garden.m4b"));
  await expect(
    page.getByText("Ready to listen", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Go to my library" }).click();
  await page
    .getByRole("button", {
      name: "Garden with chapters Ada Rivers",
      exact: true,
    })
    .click();
  page.once("dialog", (d) => d.accept("3"));
  await page
    .getByRole("button", { name: "Split audio", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Morning · Part 2", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Move Morning · Part 2 up", exact: true })
    .click();
  await expect(page.locator(".chapter-title").first()).toHaveText(
    "Morning · Part 2",
  );
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Remove chapter Morning", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Morning", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  await page.getByRole("button", { name: "Play audiobook" }).click();
  await expect(
    page.getByRole("slider", { name: "Seek chapter" }),
  ).toHaveAttribute("max", "3");
  await page.getByRole("button", { name: /02 Evening/ }).click();
  await expect(
    page.getByRole("slider", { name: "Seek chapter" }),
  ).toHaveAttribute("max", "6.064");
});
