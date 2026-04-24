import type { Browser } from "puppeteer-core";

/**
 * Launch a browser. Single code path for local + serverless:
 *   puppeteer-core + @sparticuz/chromium-min.
 *
 * On first cold start per instance, chromium-min downloads the Chrome
 * tarball from a CDN and extracts it under /tmp. Concurrent invocations
 * on Fluid Compute would otherwise race on that extraction and fail
 * with `spawn ETXTBSY` (one process writing the binary while another
 * tries to exec it). We memoize the executablePath() promise at module
 * scope so the extraction happens exactly once per Node process.
 */

const CHROMIUM_BINARY_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v147.0.0/chromium-v147.0.0-pack.x64.tar";

let execPathPromise: Promise<string> | null = null;

async function getServerlessExecPath(): Promise<string> {
  if (!execPathPromise) {
    execPathPromise = (async () => {
      const chromium = (await import("@sparticuz/chromium-min")).default;
      return chromium.executablePath(CHROMIUM_BINARY_URL);
    })().catch((err) => {
      // Don't cache failures - let next call retry.
      execPathPromise = null;
      throw err;
    });
  }
  return execPathPromise;
}

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
  const executablePath = await getServerlessExecPath();
  return puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true,
  }) as unknown as Browser;
}
