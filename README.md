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
  anchor: string;
  score: number;
  keywords: string[];
}

class LinkScraper {
  private readonly KEYWORD_WEIGHTS = {
    'acfr': 3,
    'budget': 2,
    'contact': 1.5
  };

  async scrape(url: string): Promise<ScrapedLink[]> {
    // ... scraping logic ...
  }
}
```

### Phase 3: Database Setup (SQLite)

```typescript:src/storage/database.ts
import Database from 'better-sqlite3';

export const db = new Database('links.db');

// Initial schema
db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY,
    url TEXT UNIQUE,
    anchor_text TEXT,
    score REAL,
    keywords JSON,
    parent_url TEXT,
    crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
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

- [ ] GET /links (search)
- [ ] GET /links/:id (details)
- [ ] POST /scrape (trigger new scrape)
- [ ] Rate limiting middleware
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
    npx ts-node src/storage/database.ts
    ```

2. Start scraper:

    ```bash
    npx ts-node src/core/scrapper.ts --url https://example.com
    ```

3. Run API:

    ```bash
    npx ts-node src/api/server.ts
    ```

## Scaling Considerations

1. **Database**: Switch to PostgreSQL using same SQL schema
2. **Queue**: Add BullMQ with Redis for job management
3. **Cache**: Implement Redis caching for frequent queries
4. **Cluster**: Use PM2 for process management
