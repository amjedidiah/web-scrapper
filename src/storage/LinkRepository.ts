import { ulid } from "ulid";
import type { ScrapedLink } from "../core/scrapper";
import db from "./initDB";

export class LinkRepository {
  async insertLink(link: ScrapedLink & { parentUrl: string }): Promise<void> {
    const stmt = db.prepare(`
      INSERT INTO links (id, url, anchor_text, score, keywords, parent_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      ulid(),
      link.url,
      link.anchorText,
      link.score,
      JSON.stringify(link.keywords),
      link.parentUrl,
    );
  }

  async bulkInsert(links: Array<ScrapedLink & { parentUrl: string }>): Promise<void> {
    const insert = db.prepare(`
      INSERT INTO links (id, url, anchor_text, score, keywords, parent_url, type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET
        score = excluded.score,
        keywords = excluded.keywords,
        type = excluded.type
    `);

    const transaction = db.transaction((links) => {
      for (const link of links) {
        try {
          insert.run(
            ulid(),
            link.url,
            link.anchorText,
            link.score,
            JSON.stringify(link.keywords),
            link.parentUrl,
            link.type,
          );
        } catch (error) {
          console.error("Failed to insert link:", {
            url: link.url,
            error: (error as Error).message,
          });
        }
      }
    });

    transaction(links);
  }
}
