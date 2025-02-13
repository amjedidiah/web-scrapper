# High-Value Link Scraper (TypeScript Edition)

[![Project Status: WIP](https://img.shields.io/badge/status-WIP-yellow.svg)](https://example.com)

## Implementation Roadmap ✅

### Phase 1: Core Setup

```bash
npm init -y
npm install typescript ts-node @types/node express better-sqlite3 cheerio puppeteer
npm install -D eslint @typescript-eslint/parser
```

### Phase 2: Scraper Implementation

```typescript:src/core/scrapper.ts
interface ScrapedLink {
  url: string;
  anchor_text: string;
  score: number;
  type: "document" | "contact" | "general";
  keywords: string[];
}

class LinkScraper {
  private readonly KEYWORD_WEIGHTS = {
    acfr: 3,
    budget: 2.5,
    "finance director": 2,
    contact: 2,
    document: 1.5,
  };

  async scrape(url: string): Promise<ScrapedLink[]> {
    // ... scraping logic ...
  }
}
```

### Phase 3: Database Setup (SQLite)

```typescript:src/config/database.ts
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
  CREATE INDEX IF NOT EXISTS idx_parent_url ON links (parent_url);
  CREATE INDEX IF NOT EXISTS idx_keywords_length ON links (json_array_length(keywords))
    WHERE json_array_length(keywords) > 0;
`);

console.info("Database initialized successfully");

export default db;
```

### Phase 4: Express API

```typescript:src/api/server.ts
import express from 'express';

const app = express();
app.get('/links', async (req, res) => {
  const { minScore = '0.5', keyword } = req.query;
  // ... database query ...
});

app.listen(3000, () => {
  console.info('API running on port 3000');
});
```

### Phase 5: Scaling Preparation

```typescript:src/config/scale.ts
export const config = {
  rateLimiting: {
    windowMs: 60_000,
    maxRequests: 1000
  },
  database: {
    poolSize: process.env.NODE_ENV === 'production' ? 50 : 10
  }
};
```

## Implementation Checklist

### Core Functionality

- [x] Base scraper with Cheerio/Puppeteer
- [x] Priority keyword scoring
- [x] Contact page detection
- [x] PDF/document link detection

### Data Pipeline

- [x] SQLite schema setup
- [x] Batch insert operations
- [x] Duplicate URL handling
- [x] Index optimization

### API Features

- [x] GET /links (search)
- [x] GET /links/:id (details)
- [x] POST /scrape (trigger new scrape)
- [x] Rate limiting middleware
- [ ] Pagination support

### Testing

```typescript:test/scraper.test.ts
const TEST_SITES = [
  'https://www.a2gov.org/',
  'https://bozeman.net/',
  'https://asu.edu/'
];

test.each(TEST_SITES)('Scrapes %s successfully', async (url) => {
  const results = await scraper.scrape(url);
  expect(results.length).toBeGreaterThan(0);
  expect(results[0].score).toBeDefined();
});
```

## Quick Start

1. Initialize database:

    ```bash
    npx ts-node src/config/database.ts
    ```

2. Test scraper:

    ```bash
    npm run test
    ```

3. Run API Server:

    ```bash
    npm run api:dev     # Dev environment
    npm run api:start   # Prod environment
    ```

## Scaling Considerations

1. **Database**: Switch to PostgreSQL using same SQL schema
2. **Queue**: Add BullMQ with Redis for job management
3. **Cache**: Implement Redis caching for frequent queries
4. **Cluster**: Use PM2 for process management
