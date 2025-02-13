import Database, { Database as DatabaseType } from "better-sqlite3";
import { ulid } from "ulid";
import config from "../config/scale";
import type { ScrapedLink } from "../core/scrapper";

export class LinkRepository {
  private static readonly pool: Map<string, DatabaseType> = new Map();

  private getConnection(): DatabaseType {
    // Clean up closed connections
    LinkRepository.pool.forEach((conn, id) => {
      if (conn.open === false) LinkRepository.pool.delete(id);
    });

    if (LinkRepository.pool.size >= config.database.poolSize) {
      return [...LinkRepository.pool.values()][0];
    }

    const newConn = new Database("links.db", {
      timeout: config.database.timeout,
    });
    LinkRepository.pool.set(ulid(), newConn);
    return newConn;
  }

  async insertLink(link: ScrapedLink & { parentUrl: string }): Promise<void> {
    const db = this.getConnection();
    const stmt = db.prepare(`
      INSERT INTO links (id, url, anchor_text, score, keywords, parent_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      ulid(),
      link.url,
      link.anchor_text,
      link.score,
      JSON.stringify(link.keywords),
      link.parentUrl,
    );
  }

  async bulkInsert(links: Array<ScrapedLink & { parentUrl: string }>): Promise<void> {
    const db = this.getConnection();
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
            link.anchor_text,
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
