import db from "../config/database";

db.exec(`
  -- Clean up existing links structure
  DROP VIEW IF EXISTS links;
  DROP TABLE IF EXISTS links;
  
  -- Create unified view
  CREATE VIEW links AS
    SELECT * FROM links_high
    UNION ALL
    SELECT * FROM links_medium
    UNION ALL
    SELECT * FROM links_low;

  -- Modified trigger with conflict handling
  CREATE TRIGGER IF NOT EXISTS links_insert_trigger
  INSTEAD OF INSERT ON links
  BEGIN
    INSERT OR IGNORE INTO links_high 
    SELECT * FROM new WHERE score >= 0.7;
    
    INSERT OR IGNORE INTO links_medium 
    SELECT * FROM new WHERE score >= 0.3 AND score < 0.7;
    
    INSERT OR IGNORE INTO links_low 
    SELECT * FROM new WHERE score < 0.3;
  END;

  -- Create shard tables with full schema definition
  CREATE TABLE IF NOT EXISTS links_high (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    anchor_text TEXT NOT NULL,
    score REAL NOT NULL CHECK (score >= 0.7),
    keywords TEXT NOT NULL CHECK(json_valid(keywords)),
    parent_url TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('document', 'contact', 'general')),
    crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS links_medium (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    anchor_text TEXT NOT NULL,
    score REAL NOT NULL CHECK (score >= 0.3 AND score < 0.7),
    keywords TEXT NOT NULL CHECK(json_valid(keywords)),
    parent_url TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('document', 'contact', 'general')),
    crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS links_low (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    anchor_text TEXT NOT NULL,
    score REAL NOT NULL CHECK (score < 0.3),
    keywords TEXT NOT NULL CHECK(json_valid(keywords)),
    parent_url TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('document', 'contact', 'general')),
    crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- SQLite-compatible trigger
  CREATE TRIGGER IF NOT EXISTS links_insert_trigger
  INSTEAD OF INSERT ON links
  BEGIN
    INSERT INTO links_high
    SELECT * FROM new WHERE score >= 0.7;
    
    INSERT INTO links_medium
    SELECT * FROM new WHERE score >= 0.3 AND score < 0.7;
    
    INSERT INTO links_low
    SELECT * FROM new WHERE score < 0.3;
  END;

  ${["high", "medium", "low"]
    .map(
      (shard) => `
    -- Shard-specific versions of previous indexes
    CREATE INDEX IF NOT EXISTS idx_score_${shard} ON links_${shard} (score);
    CREATE INDEX IF NOT EXISTS idx_keywords_${shard} ON links_${shard} (keywords);
    CREATE INDEX IF NOT EXISTS idx_type_${shard} ON links_${shard} (type);
    CREATE INDEX IF NOT EXISTS idx_parent_url_${shard} ON links_${shard} (parent_url);
    CREATE INDEX IF NOT EXISTS idx_keywords_length_${shard} ON links_${shard} (json_array_length(keywords))
      WHERE json_array_length(keywords) > 0;
    CREATE INDEX IF NOT EXISTS idx_score_parent_url_${shard} ON links_${shard} (score, parent_url);
  `,
    )
    .join("")}
`);
