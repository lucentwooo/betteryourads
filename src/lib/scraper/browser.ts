import type { Browser } from "puppeteer-core";

/**
 * Launch a browser that works both locally and on Vercel Functions.
 *
 * Locally: use the regular `puppeteer` package which downloads its own
 *   bundled Chromium on install.
 * Vercel serverless: use `puppeteer-core` + `@sparticuz/chromium-min`.
 *   The -min variant doesn't ship the ~60MB Chrome binary inside the
 *   function (which blows Vercel's 250MB function size limit). Instead
 *   we point executablePath at a CDN-hosted tarball that gets fetched
 *   and cached at runtime.
 */

// Keep this version pinned to the one in package.json
// (@sparticuz/chromium-min ^147.x). The binary tarball lives on the
// Sparticuz GitHub releases page.
const CHROMIUM_BINARY_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v147.0.0/chromium-v147.0.0-pack.x64.tar";

export async function launchBrowser(): Promise<Browser> {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium-min")).default;
    const puppeteer = await import("puppeteer-core");
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(CHROMIUM_BINARY_URL),
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
