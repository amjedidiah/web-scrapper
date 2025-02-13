import logger from "../api/lib/logger";
import db from "../config/database";
import { LinkScraper } from "../core/scrapper";
import { LinkEntity } from "../types";

const TEST_URLS = ["https://www.a2gov.org/", "https://bozeman.net/", "https://asu.edu/"];

describe("Phase 1 Tests", () => {
  const scraper = new LinkScraper();

  beforeEach(() => {
    // Clear all shard tables between tests using individual statements
    const clearStmts = [
      db.prepare("DELETE FROM links_high"),
      db.prepare("DELETE FROM links_medium"),
      db.prepare("DELETE FROM links_low"),
    ];

    db.transaction(() => {
      clearStmts.forEach((stmt) => stmt.run());
    })();
  });

  test.each(TEST_URLS)(
    "Should scrape and store links for %s",
    async (url) => {
      logger.debug(`\n=== Testing ${url} ===`);

      // Execute scrape
      const results = await scraper.scrape(url);
      logger.debug(`Found ${results.length} links, top 3:`);
      console.table(results.slice(0, 3));

      // Verify database records
      const dbLinks = db
        .prepare<[string]>("SELECT * FROM links WHERE parent_url = ?")
        .all(url) as LinkEntity[];

      // Basic assertions
      expect(results.length).toBeGreaterThan(0);
      expect(dbLinks.length).toBeLessThanOrEqual(results.length);
      expect(dbLinks.length).toBeGreaterThan(0);

      // Verify first result
      const firstResult = results[0];
      const firstDbLink = dbLinks[0];
      expect(firstDbLink.url).toBe(firstResult.url);
      expect(firstDbLink.score).toBeCloseTo(firstResult.score);
      expect(JSON.parse(firstDbLink.keywords)).toEqual(firstResult.keywords);

      // Verify ULID format
      expect(firstDbLink.id).toMatch(/^[0-9A-Z]{26}$/);
    },
    30_000,
  );

  afterAll(() => {
    db.close();
  });
});
