import request from "supertest";
import { app, server } from "../../api/server";
import db from "../../config/database";

describe("GET /links/:id", () => {
  const TEST_LINK_ID = "01HXYZABCDEFGHJKLMNOPQRST";
  const NON_EXISTENT_ID = "01HXYZABCDEFGHJKLMNOPQR00";

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

      // Insert test data
      db.prepare(
        `
        INSERT INTO links_high (id, url, anchor_text, score, keywords, parent_url, type, crawled_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        TEST_LINK_ID,
        "https://example.com/budget",
        "Annual Budget",
        0.85,
        JSON.stringify(["budget", "finance"]),
        "https://example.com",
        "document",
        new Date().toISOString(),
      );
    })();
  });

  beforeEach(() => {
    // Clear rate limit counts
    jest.useFakeTimers().setSystemTime(new Date());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("should retrieve link by ID", async () => {
    const response = await request(app).get(`/links/${TEST_LINK_ID}`).expect(200);

    expect(response.body).toEqual({
      error: false,
      message: "Successfully retrieved link",
      data: {
        id: TEST_LINK_ID,
        url: "https://example.com/budget",
        anchor_text: "Annual Budget",
        score: 0.85,
        keywords: ["budget", "finance"],
        parent_url: "https://example.com",
        type: "document",
        crawled_at: expect.any(String),
      },
    });
  });

  test("should return 404 for non-existent ID", async () => {
    const response = await request(app).get(`/links/${NON_EXISTENT_ID}`).expect(404);

    expect(response.body).toEqual({
      error: true,
      message: "Link not found",
      data: expect.objectContaining({
        statusCode: 404,
        url: `/links/${NON_EXISTENT_ID}`,
        method: "GET",
      }),
    });
  });

  test("should return 404 for invalid ID format", async () => {
    const response = await request(app).get("/links/invalid-id-format").expect(404);

    expect(response.body).toEqual({
      error: true,
      message: "Link not found",
      data: expect.objectContaining({
        statusCode: 404,
        url: "/links/invalid-id-format",
        method: "GET",
      }),
    });
  });

  afterAll(async () => {
    // Proper server cleanup
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });
});
