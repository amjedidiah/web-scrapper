import { Database } from "better-sqlite3";
import { ulid } from "ulid";
import db from "../config/database";
import config from "../config/scale";
import type { ScrapedLink } from "../core/scrapper";
import logger from "../lib/logger";

export type ScrapedLinkWithParent = ScrapedLink & { parentUrl: string };

export class LinkRepository {
  private static readonly pool: Map<string, Database> = new Map();

  private getConnection(): Database {
    // Clean up closed connections
    LinkRepository.pool.forEach((conn, id) => {
      if (conn.open === false) LinkRepository.pool.delete(id);
    });

    if (LinkRepository.pool.size >= config.database.poolSize) {
      return [...LinkRepository.pool.values()][0];
    }

    LinkRepository.pool.set(ulid(), db);
    return db;
  }

  async insertLink(link: ScrapedLinkWithParent): Promise<void> {
    const db = this.getConnection();
    const shard = this.determineShard(link.score);

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO links_${shard} 
      (id, url, anchor_text, score, keywords, parent_url, type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      ulid(),
      link.url,
      link.anchor_text,
      link.score,
      JSON.stringify(link.keywords),
      link.parentUrl,
      link.type,
    );
  }

  async bulkInsert(links: Array<ScrapedLinkWithParent>): Promise<void> {
    const db = this.getConnection();

    // Group links by score range for efficient batch inserts
    const shardedLinks = links.reduce(
      (acc, link) => {
        const shard = this.determineShard(link.score);
        acc[shard].push(link);
        return acc;
      },
      {
        high: [] as Array<ScrapedLinkWithParent>,
        medium: [] as Array<ScrapedLinkWithParent>,
        low: [] as Array<ScrapedLinkWithParent>,
      },
    );

    // Use transaction for atomic operations
    db.transaction(() => {
      for (const [shard, shardLinks] of Object.entries(shardedLinks)) {
        if (shardLinks.length === 0) continue;

        const stmt = db.prepare(`
          INSERT OR IGNORE INTO links_${shard} 
          (id, url, anchor_text, score, keywords, parent_url, type)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const link of shardLinks) {
          stmt.run(
            ulid(),
            link.url,
            link.anchor_text,
            link.score,
            JSON.stringify(link.keywords),
            link.parentUrl,
            link.type,
          );
        }
      }
    })();

    const minScore = Math.min(...links.map((link) => link.score));
    const maxScore = Math.max(...links.map((link) => link.score));
    logger.info(`Inserted ${links.length} links with scores between ${minScore} and ${maxScore}`);
  }

  private determineShard(score: number): "high" | "medium" | "low" {
    if (score >= 0.7) return "high";
    if (score >= 0.3) return "medium";
    return "low";
  }
}
