import { load } from "cheerio";
import { performance } from "perf_hooks";
import puppeteer, { Browser } from "puppeteer";
import scale from "../config/scale";
import logger from "../lib/logger";
import { LinkRepository } from "../repositories/LinkRepository";
import { LinkEntity } from "../types";

export type ScrapedLink = Pick<LinkEntity, "url" | "anchor_text" | "score" | "type"> & {
  keywords: string[];
};

export class LinkScraper {
  private readonly KEYWORD_WEIGHTS = {
    acfr: 3,
    budget: 2.5,
    "finance director": 2,
    contact: 2,
    document: 1.5,
  };

  private readonly repository = new LinkRepository();
  private activeRequests = 0;
  private browser: Browser | null = null;

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async scrape(url: string): Promise<ScrapedLink[]> {
    const startTime = performance.now();
    logger.info(`[Scrape] Starting scrape job for ${url}`);

    try {
      const html = await this.fetchHtml(url);
      const htmlFetchTime = performance.now();
      logger.debug(`[Scrape] HTML fetched in ${((htmlFetchTime - startTime) / 1000).toFixed(2)}s`);

      const { invalidUrls, links } = this.processHtml(html, url);
      logger.info(
        `[Scrape] Processed ${links.length} unique links | ` +
          `Invalid: ${invalidUrls} skipped | ` +
          `Processing time: ${((performance.now() - htmlFetchTime) / 1000).toFixed(2)}s` +
          `Scored: ${links.filter((l) => l.score > 0).length} scored, top 3: | `,
      );
      console.table(links.slice(0, 3));

      const dbStart = performance.now();
      await this.repository.bulkInsert(
        links.map((link) => ({
          ...link,
          parentUrl: url,
        })),
      );
      logger.debug(`[Scrape] DB insert took ${((performance.now() - dbStart) / 1000).toFixed(2)}s`);

      return links;
    } finally {
      logger.debug(
        `[Scrape] Total scrape time: ${((performance.now() - startTime) / 1000).toFixed(2)}s`,
      );
      await this.close(); // Ensure browser cleanup
    }
  }

  private async fetchHtml(url: string): Promise<string> {
    logger.debug(`[Fetch] Starting fetch for ${url}`);
    const MAX_RETRIES = 3;
    let attempt = 0;

    try {
      // Try HTTP first
      const httpContent = await this.fetchWithHttpClient(url);
      if (!this.needsBrowserRendering(httpContent)) return httpContent;
      logger.debug("Falling back to Puppeteer for Browser rendering");
    } catch (httpError) {
      logger.debug(`HTTP client failed: ${(httpError as Error).message}`);
    }

    // Fallback to Puppeteer with retries
    while (attempt < MAX_RETRIES) {
      try {
        return await this.fetchWithBrowserInstance(url, attempt);
      } catch (error) {
        const { shouldRetry, delay } = this.handleFetchError(error as Error, attempt, MAX_RETRIES);
        if (!shouldRetry) throw error;

        logger.warn(`Retrying ${url} in ${delay}ms (${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt++;
      }
    }
    throw new Error(`Max retries (${MAX_RETRIES}) exceeded for ${url}`);
  }

  private handleFetchError(error: Error, attempt: number, maxRetries: number) {
    const isDnsError = error.message.includes("ERR_NAME_NOT_RESOLVED");
    const isRecoverable =
      !isDnsError &&
      (error.message.includes("ERR_BLOCKED_BY_CLIENT") || error.message.includes("net::ERR"));

    if (isDnsError) {
      logger.error(`DNS resolution failed: ${error.message}`);
      return { shouldRetry: false, delay: 0 };
    }

    const shouldRetry = isRecoverable && attempt < maxRetries - 1;
    const delay = shouldRetry ? Math.pow(2, attempt) * 1000 : 0; // Exponential backoff

    return { shouldRetry, delay };
  }

  private async fetchWithHttpClient(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), scale.scraping.httpTimeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; HybridScraper/1.0)",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const content = await response.text();

      return content;
    } finally {
      clearTimeout(timeout);
    }
  }

  private needsBrowserRendering(content: string): boolean {
    // Detect common JS-rendered page patterns
    const jsRenderingIndicators = [
      "<noscript>",
      "Loading...",
      "window.location",
      '<div id="root"></div>', // Common SPA container
    ];

    return (
      content.length < 500 || // Suspiciously small content
      !content.includes("<html") || // Not proper HTML
      jsRenderingIndicators.some((indicator) => content.includes(indicator))
    );
  }

  private async fetchWithBrowserInstance(url: string, attempt: number): Promise<string> {
    // Add concurrency control
    while (this.activeRequests >= scale.scraping.maxConcurrent)
      await new Promise((resolve) => setTimeout(resolve, 100));

    const startTime = performance.now();
    this.activeRequests++;

    try {
      logger.debug(`[Browser] Launching instance for ${url}`);

      // Add concurrency monitoring
      if (this.activeRequests >= scale.scraping.maxConcurrent)
        logger.warn(
          `[Concurrency] Waiting for slot (${this.activeRequests}/` +
            `${scale.scraping.maxConcurrent} active)`,
        );

      const browser = await this.getBrowser();
      const page = await browser.newPage();
      const navStart = performance.now();

      // Set DNS resolution timeout
      page.setDefaultNavigationTimeout(scale.scraping.dnsTimeout);

      await page.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
      });

      // Rotating user agents
      await page.setUserAgent(
        [
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "AppleWebKit/537.36 (KHTML, like Gecko)",
          `Chrome/${117 + attempt}.0.0.0`,
          "Safari/537.36",
        ].join(" "),
      );

      await page.setJavaScriptEnabled(true);
      await page.setRequestInterception(true);

      page.on("request", (req) => {
        const blockedResources = ["image", "stylesheet", "font", "media", "ping", "csp_report"];
        if (blockedResources.includes(req.resourceType())) req.abort();
        else req.continue();
      });

      // Add request/response monitoring
      page.on("response", (response) =>
        logger.debug(`[${attempt}] ${response.status()} ${response.url()}`),
      );

      // Faster navigation for tests
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: scale.scraping.navigationTimeout,
      });

      const finalUrl = page.url();
      if (finalUrl !== url) {
        logger.warn(`Redirected to ${finalUrl} during attempt ${attempt}`);
      }

      const content = await page.content();
      logger.debug(
        `[Browser] Page content (${content.length} bytes) ` +
          `loaded in ${((performance.now() - navStart) / 1000).toFixed(2)}s`,
      );

      logger.info(`Scraped ${url} successfully (${content.length} bytes)`);
      await page.close();
      this.activeRequests--;
      return content;
    } finally {
      this.activeRequests--;
      logger.debug(
        `[Browser] Instance closed for ${url} | ` +
          `Total time: ${((performance.now() - startTime) / 1000).toFixed(2)}s`,
      );
    }
  }

  private async getBrowser() {
    if (!this.browser?.connected) {
      const isTestEnv = process.env.NODE_ENV === "test";

      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          ...(isTestEnv
            ? [
                "--single-process",
                "--no-zygote",
                "--disable-features=site-per-process",
                "--disable-setuid-sandbox",
                "--disable-background-timer-throttling",
                "--disable-renderer-backgrounding",
                "--disable-extensions",
                "--disable-component-extensions-with-background-pages",
                "--disable-default-apps",
              ]
            : []),
          "--disable-dns-retries",
          "--dns-prefetch-disable",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
          "--disable-dev-shm-usage",
        ],
        timeout: scale.scraping.connectTimeout,
      });

      // Add safety cleanup
      this.browser.on("disconnected", () => (this.browser = null));
    }
    return this.browser;
  }

  private processHtml(
    html: string,
    baseUrl: string,
  ): { invalidUrls: number; links: ScrapedLink[] } {
    const startTime = performance.now();
    const $ = load(html);
    const uniqueLinks = new Map<string, { url: string; anchorText: string }>();
    let invalidUrls = 0;

    $("a[href]").each((_, el) => {
      const $el = $(el);
      try {
        const href = $el.attr("href")!;
        const url = new URL(href, baseUrl).toString();
        const anchorText = $el.text().trim();

        // Keep highest priority version of duplicate URLs
        if (!uniqueLinks.has(url) || anchorText.length > uniqueLinks.get(url)!.anchorText.length) {
          uniqueLinks.set(url, { url, anchorText });
        }
      } catch (error) {
        logger.warn(`Invalid URL skipped: ${$el.attr("href")}. error: ${(error as Error).message}`);
        invalidUrls++;
      }
    });

    logger.debug(
      `[Process] Parsed ${uniqueLinks.size} links in ${((performance.now() - startTime) / 1000).toFixed(2)}s`,
    );
    return { invalidUrls, links: this.rankLinks(Array.from(uniqueLinks.values())) };
  }

  private rankLinks(links: Array<{ url: string; anchorText: string }>): ScrapedLink[] {
    const startTime = performance.now();
    const rankedLinks = links
      .map((link) => {
        const { url, anchorText: anchor_text } = link;
        const keywords = this.detectKeywords(link);
        const type = this.determineLinkType(link.url, keywords);

        return {
          url,
          anchor_text,
          keywords,
          score: this.calculateScore(keywords, type),
          type,
        };
      })
      .sort((a, b) => b.score - a.score);

    logger.debug(
      `[Rank] Scored ${links.length} links in ${((performance.now() - startTime) / 1000).toFixed(2)}s`,
    );
    return rankedLinks;
  }

  private determineLinkType(url: string, keywords: string[]): ScrapedLink["type"] {
    // Check URL structure first
    const contactPatterns = ["/contact", "contact-us", "staff-directory", "leadership-team"];

    if (contactPatterns.some((pattern) => new URL(url).pathname.includes(pattern))) {
      return "contact";
    }

    // Then check keywords
    if (keywords.includes("document")) return "document";
    if (keywords.includes("contact")) return "contact";

    return "general";
  }

  private calculateScore(keywords: string[], type: ScrapedLink["type"]): number {
    const typeMultipliers = {
      document: 1.2,
      contact: 1.5,
      general: 1.0,
    };

    return (
      keywords.reduce((acc, kw) => {
        return acc + (this.KEYWORD_WEIGHTS[kw as keyof typeof this.KEYWORD_WEIGHTS] || 0);
      }, 0) * typeMultipliers[type]
    );
  }

  private detectKeywords(link: { url: string; anchorText: string }): string[] {
    const combined = `${link.anchorText} ${link.url}`.toLowerCase();
    const keywords = Object.keys(this.KEYWORD_WEIGHTS).filter((kw) => combined.includes(kw));

    const isDocument = /\.(pdf|docx?|xlsx?|csv)$/i.test(link.url);
    if (isDocument) return [...keywords, "document"];

    return keywords;
  }
}
