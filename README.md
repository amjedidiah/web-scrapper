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
import { config } from "dotenv";
import scale from "./scale";

// Load environment variables FIRST
config({
  path:
    {
      production: ".env",
      test: ".env.test",
    }[process.env.NODE_ENV!] ?? ".env.local",
});

// Validate environment variable
const DB_PATH = process.env.SQLITE_DB_NAME;
if (!DB_PATH) throw new Error("SQLITE_DB_NAME environment variable not set");

// Initialize primary database instance
const primaryDB = new Database(DB_PATH, {
  timeout: scale.database.timeout,
  undefined,
});

// Apply performance optimizations
primaryDB.pragma("journal_mode = WAL");
primaryDB.pragma("synchronous = NORMAL");
primaryDB.pragma("temp_store = MEMORY");
primaryDB.pragma("mmap_size = 30000000000");

// Create connection pool
const pool = Array.from({ length: scale.database.poolSize }, () => primaryDB);

// Export wrapped instance with all required methods
export default {
  ...primaryDB,
  exec: (sql: string) => primaryDB.exec(sql),
  prepare: (sql: string) => pool[Math.floor(Math.random() * pool.length)].prepare(sql),
  close: () => primaryDB.close(),
  transaction: (fn: (...args: unknown[]) => unknown) => {
    const transactionFn = primaryDB.transaction(fn);
    return (...args: Parameters<typeof transactionFn>) => transactionFn(...args);
  },
} as unknown as Database.Database;

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
  logger.info('API running on port 3000');
});
```

### Phase 5: Scaling Preparation

```typescript:src/config/scale.ts
const scale = {
  rateLimiting: {
    windowMs: 60_000, // 1 minute window
    maxRequests: 1000, // Limit each IP to 1000 requests per window
  },
  database: {
    poolSize: process.env.NODE_ENV === "production" ? 100 : 20,
    timeout: 30_000, // 30 second connection timeout
  },
  scraping: {
    maxConcurrent: process.env.NODE_ENV === "production" ? 100 : 10,
    dnsTimeout: 10_000,
    connectTimeout: 15_000,
    navigationTimeout: 45_000,
    httpTimeout: 10_000, // 10 seconds for HTTP requests
  },
  search: {
    pageSize: 100,
  },
};

export default scale;
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
- [x] Pagination support

### Testing

```typescript:test/scraper.test.ts
const TEST_SITES = [
  'https://www.a2gov.org/',
  'https://bozeman.net/',
  'https://asu.edu/'
  'https://boerneisd.net/'
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
