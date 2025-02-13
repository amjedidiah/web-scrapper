import Database from "better-sqlite3";

const db = new Database("links.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    anchor_text TEXT NOT NULL,
    score REAL NOT NULL,
    keywords TEXT NOT NULL CHECK(json_valid(keywords)),
    parent_url TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('document', 'contact', 'general')),
    crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE INDEX IF NOT EXISTS idx_score ON links (score);
  CREATE INDEX IF NOT EXISTS idx_keywords ON links (keywords);
  CREATE INDEX IF NOT EXISTS idx_type ON links (type);
`);

console.info("Database initialized successfully");

export default db;
