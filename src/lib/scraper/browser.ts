import type { Browser } from "puppeteer-core";

/**
 * Launch a browser that works both locally and on Vercel Functions.
 *
 * Locally: use the regular `puppeteer` package which downloads its own
 *   bundled Chromium on install.
 * Vercel serverless: use `puppeteer-core` + `@sparticuz/chromium`, a
 *   Lambda-sized Chromium binary (no pre-installed browser on Vercel).
 */
export async function launchBrowser(): Promise<Browser> {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = await import("puppeteer-core");
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    }) as unknown as Browser;
  }

  // Local dev — use the full `puppeteer` package which ships its own Chrome.
  const puppeteer = await import("puppeteer");
  return puppeteer.default.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  }) as unknown as Browser;
}
