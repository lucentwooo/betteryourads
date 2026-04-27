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
      const t0 = Date.now();
      console.log(`[browser] downloading/extracting chromium from CDN`);
      const chromium = (await import("@sparticuz/chromium-min")).default;
      const p = await chromium.executablePath(CHROMIUM_BINARY_URL);
      console.log(`[browser] chromium ready at ${p} in ${Date.now() - t0}ms`);
      return p;
    })().catch((err) => {
      // Don't cache failures - let next call retry.
      console.warn(`[browser] chromium download/extract failed:`, err instanceof Error ? err.message : err);
      execPathPromise = null;
      throw err;
    });
  }
  return execPathPromise;
}

function withHardTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
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
  // Cold-download the chromium binary with a hard timeout. If GitHub's CDN
  // hangs we'd otherwise hold the whole function for 300s and the user
  // sees no screenshot with no error. Fail fast so the pipeline can fall
  // back to og:image extraction.
  const executablePath = await withHardTimeout(
    getServerlessExecPath(),
    60_000,
    "chromium executablePath",
  );
  const t0 = Date.now();
  const browser = (await withHardTimeout(
    puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    }) as unknown as Promise<Browser>,
    30_000,
    "puppeteer.launch",
  )) as Browser;
  console.log(`[browser] puppeteer.launch took ${Date.now() - t0}ms`);
  return browser;
}
