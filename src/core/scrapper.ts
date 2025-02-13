import { load } from "cheerio";
import puppeteer from "puppeteer";
import { LinkRepository } from "../storage/LinkRepository";

export interface ScrapedLink {
  url: string;
  anchorText: string;
  score: number;
  keywords: string[];
  type: 'document' | 'contact' | 'general';
}

export class LinkScraper {
  private readonly KEYWORD_WEIGHTS = {
    acfr: 3,
    budget: 2.5,
    "finance director": 2,
    contact: 2,
    document: 1.5
  };

  private readonly repository = new LinkRepository();

  async scrape(url: string): Promise<ScrapedLink[]> {
    const html = await this.fetchHtml(url);
    const links = this.processHtml(html, url);

    // Store results
    await this.repository.bulkInsert(
      links.map((link) => ({
        ...link,
        parentUrl: url, // Add parent URL context
      }))
    );

    return links;
  }

  private async fetchHtml(url: string): Promise<string> {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--disable-dev-shm-usage",
        "--no-zygote",
        "--no-sandbox",
        "--disable-web-security",
      ],
    });
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36"
    );
    await page.setJavaScriptEnabled(true);

    // Block unnecessary resources
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image", "stylesheet", "font"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, {
      waitUntil: "domcontentloaded", // Faster than networkidle
      timeout: 30_000,
    });

    const content = await page.content();
    await browser.close();
    return content;
  }

  private processHtml(html: string, baseUrl: string): ScrapedLink[] {
    const $ = load(html);
    const uniqueLinks = new Map<string, { url: string; anchorText: string }>();

    $("a[href]").each((_, el) => {
      const $el = $(el);
      try {
        const href = $el.attr("href")!;
        const url = new URL(href, baseUrl).toString();
        const anchorText = $el.text().trim();

        // Keep highest priority version of duplicate URLs
        if (
          !uniqueLinks.has(url) ||
          anchorText.length > uniqueLinks.get(url)!.anchorText.length
        ) {
          uniqueLinks.set(url, { url, anchorText });
        }
      } catch (error) {
        console.error(`Invalid URL skipped: ${$el.attr("href")}`);
      }
    });

    return this.rankLinks(Array.from(uniqueLinks.values()));
  }

  private rankLinks(
    links: Array<{ url: string; anchorText: string }>
  ): ScrapedLink[] {
    return links
      .map((link) => {
        const keywords = this.detectKeywords(link);
        const type = this.determineLinkType(link.url, keywords);
        
        return {
          ...link,
          keywords,
          score: this.calculateScore(keywords, type),
          type
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  private determineLinkType(url: string, keywords: string[]): ScrapedLink['type'] {
    // Check URL structure first
    const contactPatterns = [
      '/contact', 
      'contact-us',
      'staff-directory',
      'leadership-team'
    ];
    
    if (contactPatterns.some(pattern => new URL(url).pathname.includes(pattern))) {
      return 'contact';
    }

    // Then check keywords
    if (keywords.includes('document')) return 'document';
    if (keywords.includes('contact')) return 'contact';
    
    return 'general';
  }

  private calculateScore(keywords: string[], type: ScrapedLink['type']): number {
    const typeMultipliers = {
      document: 1.2,
      contact: 1.5,
      general: 1.0
    };

    return keywords.reduce((acc, kw) => {
      return acc + (this.KEYWORD_WEIGHTS[kw as keyof typeof this.KEYWORD_WEIGHTS] || 0);
    }, 0) * typeMultipliers[type];
  }

  private detectKeywords(link: { url: string; anchorText: string }): string[] {
    const combined = `${link.anchorText} ${link.url}`.toLowerCase();
    const keywords = Object.keys(this.KEYWORD_WEIGHTS).filter((kw) =>
      combined.includes(kw)
    );

    const isDocument = /\.(pdf|docx?|xlsx?|csv)$/i.test(link.url);
    if (isDocument) return [...keywords, 'document'];

    return keywords;
  }
}
