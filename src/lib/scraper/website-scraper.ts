import puppeteer from "puppeteer";
import path from "path";

export interface WebsiteScrapResult {
  screenshotPath: string;
  textContent: string;
  title: string;
  description: string;
  headings: string[];
  heroContent: string;
  ogImage?: string;
}

export async function scrapeWebsite(
  url: string,
  outputDir: string
): Promise<WebsiteScrapResult> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
    } catch {
      // If even domcontentloaded fails, try load with longer timeout
      await page.goto(url, {
        waitUntil: "load",
        timeout: 30000,
      }).catch(() => {});
    }

    // Wait for content to render
    await new Promise((r) => setTimeout(r, 3000));

    // Try to dismiss cookie banners -- common selectors
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button, a"));
      for (const btn of buttons) {
        const text = (btn as HTMLElement).innerText?.toLowerCase() || "";
        if (
          text.includes("accept") ||
          text.includes("allow all") ||
          text.includes("got it") ||
          text.includes("dismiss")
        ) {
          (btn as HTMLElement).click();
          break;
        }
      }
    });
    await new Promise((r) => setTimeout(r, 800));

    // Scroll through the page to trigger scroll-reveal animations
    await page.evaluate(async () => {
      const scrollHeight = Math.min(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        8000
      );
      const step = 400;
      for (let y = 0; y < scrollHeight; y += step) {
        window.scrollTo({ top: y, behavior: "instant" });
        await new Promise((r) => setTimeout(r, 150));
      }
      // Return to top for clean screenshot
      window.scrollTo({ top: 0, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 500));
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Take full-page screenshot
    const screenshotPath = path.join(outputDir, "website-screenshot.png");
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });

    // Extract page data
    const pageData = await page.evaluate(() => {
      const title = document.title || "";
      const metaDesc =
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content") || "";
      const ogImage =
        document
          .querySelector('meta[property="og:image"]')
          ?.getAttribute("content") || undefined;

      // Get all heading text
      const headings = Array.from(
        document.querySelectorAll("h1, h2, h3")
      ).map((el) => el.textContent?.trim() || "");

      // Get hero section content (first major section)
      const heroEl =
        document.querySelector("main > section:first-child") ||
        document.querySelector("main > div:first-child") ||
        document.querySelector('[class*="hero"]') ||
        document.querySelector("header + section") ||
        document.querySelector("header + div");
      const heroContent = heroEl?.textContent?.trim().slice(0, 2000) || "";

      // Get full text content (limited)
      const textContent = document.body.innerText.slice(0, 10000);

      return { title, description: metaDesc, headings, heroContent, textContent, ogImage };
    });

    return {
      screenshotPath,
      ...pageData,
    };
  } finally {
    await browser.close();
  }
}
