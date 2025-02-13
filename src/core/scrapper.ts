import { load } from "cheerio";
import puppeteer from "puppeteer";
import scale from "../config/scale";
import logger from "../lib/logger";
import { LinkRepository } from "../storage/LinkRepository";
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

  async scrape(url: string): Promise<ScrapedLink[]> {
    logger.info(`\nStarting scrape job for ${url}\n`);
    const html = await this.fetchHtml(url);

    const { invalidUrls, links } = this.processHtml(html, url);
    logger.info(
      `Found ${links.length} unique links, ${invalidUrls} invalid URLs skipped, ${links.filter((l) => l.score > 0).length} scored, top 3:`,
    );
    console.table(links.slice(0, 3));

    // Store results
    await this.repository.bulkInsert(
      links.map((link) => ({
        ...link,
        parentUrl: url, // Add parent URL context
      })),
    );

    return links;
  }

  private async fetchHtml(url: string): Promise<string> {
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        return await this.fetchWithBrowserInstance(url, attempt);
      } catch (error) {
        attempt++;
        if (attempt >= MAX_RETRIES) {
          logger.error(`Scrape failed after ${MAX_RETRIES} attempts`, {
            url,
            error: (error as Error).message,
          });
          throw error;
        }

        logger.warn(`Retrying (${attempt}/${MAX_RETRIES})`, {
          url,
          error: (error as Error).message,
          retryIn: `${2000 * attempt}ms`,
        });

        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
    throw new Error("Max retries exceeded");
  }

  private async fetchWithBrowserInstance(url: string, attempt: number): Promise<string> {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        `--max-parallel-runs=${scale.scraping.maxConcurrent}`,
        "--disable-dev-shm-usage",
        "--no-zygote",
        "--no-sandbox",
        "--disable-web-security",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    try {
      const page = await browser.newPage();
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
        if (["image", "stylesheet", "font"].includes(req.resourceType())) req.abort();
        else req.continue();
      });

      // Add request/response monitoring
      page.on("response", (response) =>
        logger.debug(`[${attempt}] ${response.status()} ${response.url()}`),
      );

      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: scale.scraping.timeout || 30_000,
      });

      const finalUrl = page.url();
      if (finalUrl !== url) {
        logger.warn(`Redirected to ${finalUrl} during attempt ${attempt}`);
      }

      const content = await page.content();
      if (!content || content.length < 1000) {
        throw new Error("Insufficient content length");
      }

      logger.info(`Scraped ${url} successfully (${content.length} bytes)`);
      await browser.close();
      return content;
    } finally {
      await browser
        .close()
        .catch((error) => logger.warn("Browser cleanup failed", { error: error.message }));
    }
  }

  private processHtml(
    html: string,
    baseUrl: string,
  ): { invalidUrls: number; links: ScrapedLink[] } {
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
        logger.warn(`Invalid URL skipped: ${$el.attr("href")}`, error);
        invalidUrls++;
      }
    });

    return { invalidUrls, links: this.rankLinks(Array.from(uniqueLinks.values())) };
  }

  private rankLinks(links: Array<{ url: string; anchorText: string }>): ScrapedLink[] {
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
