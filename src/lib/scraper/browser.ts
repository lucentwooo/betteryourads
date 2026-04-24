import type { Browser } from "puppeteer-core";

/**
 * Launch a browser. Single code path for local + serverless:
 *   puppeteer-core + @sparticuz/chromium-min.
 *
 * On first cold start per instance, chromium-min downloads the Chrome
 * tarball from a CDN and caches it in /tmp. Subsequent launches reuse
 * the cached binary.
 *
 * Locally you can override with PUPPETEER_EXECUTABLE_PATH to use a
 * browser you already have installed (e.g. /Applications/Google Chrome).
 */

const CHROMIUM_BINARY_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v147.0.0/chromium-v147.0.0-pack.x64.tar";

export async function launchBrowser(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");
  const localExec = process.env.PUPPETEER_EXECUTABLE_PATH;

  if (localExec) {
    return puppeteer.launch({
      headless: true,
      executablePath: localExec,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    }) as unknown as Browser;
  }

  const chromium = (await import("@sparticuz/chromium-min")).default;
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(CHROMIUM_BINARY_URL),
    headless: true,
  }) as unknown as Browser;
}
