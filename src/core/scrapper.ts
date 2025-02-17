import { load } from "cheerio";
import { CheerioCrawler, PlaywrightCrawler, RequestQueue } from "crawlee";
import { performance } from "perf_hooks";
import { v4 as uuid } from "uuid";
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
  private requestQueue: RequestQueue | null = null;
  private readonly activeCrawlers = new Set<CheerioCrawler | PlaywrightCrawler>();
  private html = "";

  async setRequestQueue(url: string) {
    if (!this.requestQueue) this.requestQueue = await RequestQueue.open(uuid());

    // Add URL to request list
    await this.requestQueue.addRequest({ url, uniqueKey: uuid() });
  }

  async scrape(url: string): Promise<ScrapedLink[]> {
    const startTime = performance.now();
    logger.info(`[Scrape] Starting scrape job for ${url}`);

    // Initialise request queue
    await this.setRequestQueue(url);

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
      await this.cleanup();
    }
  }

  private async fetchHtml(url: string): Promise<string> {
    logger.debug(`[Fetch] Starting fetch for ${url}`);

    // First try CheerioCrawler for static content
    const cheerioCrawler = this.createCheerioCrawler();

    try {
      await cheerioCrawler.run();
      const needsBrowser = this.needsBrowserRendering(this.html);
      await cheerioCrawler.teardown();

      if (!needsBrowser) return this.html;
    } catch (error) {
      logger.warn(`CheerioCrawler failed: ${(error as Error).message}`);
    }

    await this.setRequestQueue(url); // Add the url to the queue again for processing
    logger.debug(`Falling back to Playwright for ${url}`);
    return this.fetchWithPlaywright();
  }

  private async fetchWithPlaywright(): Promise<string> {
    const playwrightCrawler = this.createPlaywrightCrawler();

    try {
      await playwrightCrawler.run();
    } finally {
      await playwrightCrawler.teardown();
    }
    return this.html;
  }

  private needsBrowserRendering(content: string): boolean {
    // Detect common JS-rendered page patterns
    // const jsRenderingIndicators = ["<noscript>", "Loading...", "window.location"];
    const jsRenderingIndicators = ["<noscript>", "Loading..."];

    return (
      content.length < 500 || // Suspiciously small content
      !content.includes("<html") || // Not proper HTML
      jsRenderingIndicators.some((indicator) => content.includes(indicator))
    );
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

    // Detect JavaScript redirects in script tags
    $("script").each((_, el) => {
      const scriptContent = $(el).html();
      if (!scriptContent) return;

      const redirectPatterns = [
        /window\.location\.href\s*=\s*['"]([^'"]+)['"]/,
        /window\.location\.assign\(['"]([^'"]+)['"]\)/,
        /window\.location\.replace\(['"]([^'"]+)['"]\)/,
      ];

      for (const pattern of redirectPatterns) {
        const matches = RegExp(pattern).exec(scriptContent);
        if (matches?.[1]) {
          try {
            const href = matches[1];
            const url = new URL(href, baseUrl).toString();

            if (!uniqueLinks.has(url)) {
              uniqueLinks.set(url, {
                url,
                anchorText: "JavaScript redirect",
              });
            }
          } catch (error) {
            logger.error(`Invalid url: ${(error as Error).message}`);
            invalidUrls++;
          }
        }
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

  private createCheerioCrawler() {
    const crawler = new CheerioCrawler({
      requestQueue: this.requestQueue!,
      requestHandler: ({ body }) => {
        this.html = body.toString();
      },
      maxConcurrency: scale.scraping.maxConcurrent,
      maxRequestRetries: scale.scraping.maxRequestRetries,
      retryOnBlocked: true,
    });
    this.activeCrawlers.add(crawler);
    return crawler;
  }

  private createPlaywrightCrawler() {
    const crawler = new PlaywrightCrawler({
      requestQueue: this.requestQueue!,
      requestHandler: async ({ page }) => {
        this.html = await page.content();
      },
      maxConcurrency: scale.scraping.maxConcurrent,
      maxRequestRetries: 0, // Disable retries to ensure clean state
      launchContext: {
        userDataDir: `/tmp/playwright-${uuid()}`, // Unique dir per instance
        launchOptions: {
          headless: true,
          ignoreHTTPSErrors: true,
          args: [
            "--use-mock-keychain",
            "--password-store=basic",
            "--disable-encryption",
            "--no-service-authorization",
            "--disable-breakpad",
            "--no-first-run",
            "--headless=new",
            "--disable-dns-retries",
            "--dns-prefetch-disable",
            "--disable-features=ChromePasswordManager,AutomationControlled,Translate",
            "--disable-sync",
            "--disable-web-security",
            "--disable-client-side-phishing-detection",
            "--disable-component-update",
            "--disable-default-apps",
            "--no-xshm", // Disable shared memory
          ],
          permissions: [],
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          bypassCSP: true,
        },
      },
      browserPoolOptions: {
        useFingerprints: false,
        preLaunchHooks: [
          async () => {
            process.env.PLAYWRIGHT_CREDENTIALS_PATH = "/dev/null";
            process.env.PLAYWRIGHT_SKIP_BROWSER_GC = "1";
            process.env.GOOGLE_API_KEY = "no";
            process.env.GOOGLE_DEFAULT_CLIENT_ID = "no";
            process.env.GOOGLE_DEFAULT_CLIENT_SECRET = "no";
          },
        ],
        postPageCreateHooks: [
          async (page) => {
            const handleRejection = () => Promise.reject(new Error("Credentials disabled"));

            await page.context().clearCookies();
            await page.addInitScript(() => {
              Object.defineProperty(navigator, "credentials", {
                get: () => ({
                  create: handleRejection,
                  get: handleRejection,
                }),
              });
            });
          },
        ],
      },
    });

    this.activeCrawlers.add(crawler);
    return crawler;
  }

  async cleanup() {
    logger.debug(`Cleaning up`);

    for (const crawler of this.activeCrawlers) await crawler.teardown();
    this.activeCrawlers.clear();

    await this.requestQueue?.drop();
    this.requestQueue = null;

    logger.debug("Cleanup complete");
  }
}
