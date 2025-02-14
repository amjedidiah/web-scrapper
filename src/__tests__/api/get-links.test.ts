import request from "supertest";
import { app, server } from "../../api/server";
import db from "../../config/database";
import { determineShard } from "../../lib/helpers";
import { LinkEntity } from "../../types";

describe("GET /links", () => {
  beforeAll(() => {
    // Clear existing data and insert fresh test data
    db.transaction(() => {
      // Clear all shard tables first
      const clearStmts = [
        db.prepare("DELETE FROM links_high"),
        db.prepare("DELETE FROM links_medium"),
        db.prepare("DELETE FROM links_low"),
      ];
      clearStmts.forEach((stmt) => stmt.run());

      // Insert fresh test data
      const insertHigh = db.prepare(`
        INSERT INTO links_high (id, url, anchor_text, score, keywords, parent_url, type, crawled_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertMedium = db.prepare(`
        INSERT INTO links_medium (id, url, anchor_text, score, keywords, parent_url, type, crawled_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertLow = db.prepare(`
        INSERT INTO links_low (id, url, anchor_text, score, keywords, parent_url, type, crawled_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const testData = [
        {
          // High priority
          id: "01HXYZABCDEFGHJKLMNOPQRST",
          url: "https://example.com/budget",
          anchor_text: "Annual Budget",
          score: 0.85,
          keywords: JSON.stringify(["budget", "finance"]),
          parent_url: "https://example.com",
          type: "document",
          crawled_at: new Date().toISOString(),
        },
        {
          // Medium priority
          id: "01HXYZABCDEFGHJKLMNOPQRSM",
          url: "https://example.org/contact",
          anchor_text: "Contact Us",
          score: 0.6,
          keywords: JSON.stringify(["contact"]),
          parent_url: "https://example.org",
          type: "contact",
          crawled_at: new Date().toISOString(),
        },
        {
          // Low priority
          id: "01HXYZABCDEFGHJKLMNOPQRSL",
          url: "https://example.net/about",
          anchor_text: "About Us",
          score: 0.2,
          keywords: JSON.stringify(["about"]),
          parent_url: "https://example.net",
          type: "general",
          crawled_at: new Date().toISOString(),
        },
      ];

      testData.forEach((link) => {
        const stmt = determineShard(link.score, {
          high: insertHigh,
          medium: insertMedium,
          low: insertLow,
        });
        stmt.run(
          link.id,
          link.url,
          link.anchor_text,
          link.score,
          link.keywords,
          link.parent_url,
          link.type,
          link.crawled_at,
        );
      });
    })();
  });

  beforeEach(() => {
    // Clear rate limit counts
    jest.useFakeTimers().setSystemTime(new Date());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("should return paginated links with default parameters", async () => {
    const response = await request(app).get("/links").expect(200);

    expect(response.body).toMatchObject({
      error: false,
      message: "Successfully retrieved links",
      data: {
        page: 1,
        totalPages: expect.any(Number),
        totalResultsCount: expect.any(Number),
        results: expect.arrayContaining([
          expect.objectContaining({
            url: expect.any(String),
            score: expect.any(Number),
          }),
        ]),
      },
    });
  });

  test("should filter by minScore", async () => {
    const response = await request(app).get("/links?minScore=0.7").expect(200);

    const scores = response.body.data.results.map((l: LinkEntity) => l.score);
    expect(scores.every((s: number) => s >= 0.7)).toBe(true);
  });

  test("should filter by keyword", async () => {
    const response = await request(app).get("/links?keyword=budget").expect(200);

    expect(response.body.data.results).toHaveLength(1);
    expect(response.body.data.results[0].keywords).toContain("budget");
  });

  test("should filter by parentUrl", async () => {
    const response = await request(app).get("/links?parentUrl=https://example.com").expect(200);

    expect(response.body.data.results).toHaveLength(1);
    expect(response.body.data.results[0].parent_url).toBe("https://example.com");
  });

  test("should handle pagination", async () => {
    const firstPage = await request(app).get("/links?page=1").expect(200);

    const secondPage = await request(app).get("/links?page=2").expect(200);

    expect(firstPage.body.data.results[0].id).not.toBe(secondPage.body.data.results[0]?.id);
  });

  test("should validate minScore parameter", async () => {
    const response = await request(app).get("/links?minScore=invalid").expect(400);

    expect(response.body.error).toBe(true);
    expect(response.body.message).toMatch(/Invalid minScore parameter/);
  });

  test("should validate page parameter", async () => {
    const response = await request(app).get("/links?page=invalid").expect(400);

    expect(response.body.error).toBe(true);
    expect(response.body.message).toMatch(/Invalid page parameter/);
  });

  afterAll(async () => {
    // Proper server cleanup
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });
});
