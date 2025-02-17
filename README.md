# High-Value Link Scraper

[![Project Status: WIP](https://img.shields.io/badge/status-WIP-yellow.svg)](https://example.com)

A web scraper that identifies and prioritizes high-value links on web pages, focusing on extracting relevant contacts and specific files.

## Table of Contents

- [Features](#features)
- [Why Crawlee?](#why-crawlee)
- [Environment Setup](#environment-setup)
- [API Documentation](#api-documentation)
  - [GET /links](#get-links)
  - [GET /links/:id](#get-linksid)
  - [POST /scrape](#post-scrape)
- [Link Scoring Configuration](#link-scoring-configuration)
- [Performance Tuning](#performance-tuning)
  - [Database Optimization](#database-optimization)
  - [Scraping Optimization](#scraping-optimization)
  - [Memory Management](#memory-management)
  - [More Scaling Considerations](#more-scaling-considerations)
- [Testing](#testing)
  - [API Testing](#api-testing)
- [License](#license)

## Features

- Custom heuristic-based link scoring and classification
- Efficient bot detection handling via [Crawlee](https://crawlee.dev/)
- Sharded SQLite database for optimized performance
- RESTful API with rate limiting and pagination
- Comprehensive test coverage

## Why Crawlee?

After evaluating several options including [ScrapingBee](https://www.scrapingbee.com/) and [Browserless.io](https://www.browserless.io/), I chose [Crawlee](https://crawlee.dev/) for the following reasons:

- Open-source with active community
- Built-in anti-blocking features
- Automatic proxy rotation and scaling
- Seamless switching between HTTP and browser-based scraping
- TypeScript-first development

## Environment Setup

1. Install dependencies

   ```bash
   yarn install
   ```

2. Set up environment variables

   ```bash
   # Production (.env)
   SQLITE_DB_NAME=links.db
   PORT=8000
   DEBUG=info

   # Development (.env.local)
   SQLITE_DB_NAME=links_local.db
   PORT=8008
   DEBUG=info

   # Test (.env.test)
   SQLITE_DB_NAME=links_test.db
   PORT=3000
   DEBUG=debug
   ```

## API Documentation

### `GET /links`

Retrieve scraped links with filtering and pagination.

```typescript
GET /links?minScore=0.7&keyword=budget&page=1
```

**Query Parameters:**

- `minScore` (number, optional): Minimum relevance score (0-1). Defaults to 0.
- `keyword` (string, optional): Filter by keyword
- `page` (number, optional): Page number for pagination. Defaults to 1
- `parentUrl` (string, optional): Filter by parent URL

**Sample Response:**

```json
{
  "error": false,
  "message": "Successfully retrieved links",
  "data": {
    "page": 1,
    "totalPages": 5,
    "totalResultsCount": 48,
    "results": [
      {
      "id": "01HXYZABCDEFGHJKLMNOPQRST",
      "url": "https://example.com/budget",
      "anchor_text": "Annual Budget",
      "score": 0.85,
      "keywords": ["budget", "finance"],
      "parent_url": "https://example.com",
      "type": "document",
      "crawled_at": "2025-02-13 22:18:38"
      }
      {...}
    ]
  }
}
```

### `GET /links/:id`

Retrieve a specific link by ID.

```typescript
GET /links/01HXYZABCDEFGHJKLMNOPQRST
```

**Sample Response:**

```json
{
  "error": false,
  "message": "Successfully retrieved link",
  "data": {
    "id": "01JKZQNHWV5KSW9JFA05J40PNW",
    "url": "https://vercel.com/contact/sales?utm_source=next-site&utm_medium=footer&utm_campaign=home",
    "anchor_text": "Contact Sales",
    "score": 3,
    "keywords": [
        "contact"
    ],
    "parent_url": "https://www.nextjs.org",
    "type": "contact",
    "crawled_at": "2025-02-13 13:23:44"
  }
}
```

### `POST /scrape`

Trigger a new scrape job.

```typescript
POST /scrape
Content-Type: application/json
{
"url": "<https://example.com>"
}
```

**Sample Response:**

```json
{
  "data": {
    "processed": 42,
    "estimatedScore": 25.5
  },
  "message": "Scrape job completed",
  "error": false
}
```

## Link Scoring Configuration

The scraper uses a weighted keyword system to score links. Configure weights in [`src/core/scrapper.ts`](./src/core/scrapper.ts):

```typescript
private readonly KEYWORD_WEIGHTS = {
  acfr: 3, // Highest priority
  budget: 2.5, // High priority
  "finance director": 2, // Medium-high priority
  contact: 2, // Medium-high priority
  document: 1.5, // Medium priority
};
```

To modify scoring:

1. Add new keywords with weights (1-3 recommended)
2. Higher weights increase priority
3. Compound terms (e.g., "finance director") are supported
4. Restart service after changes

## Performance Tuning

### Database Optimization

- Uses table sharding based on score ranges:
  - High: score >= 0.7
  - Medium: 0.3 <= score < 0.7
  - Low: score < 0.3
- Implements connection pooling
- WAL journal mode enabled

### Scraping Optimization

Production settings [`src/config/scale.ts`](./src/config/scale.ts):

```typescript
const scale = {
  rateLimiting: {
    windowMs: 60_000,
    maxRequests: 1000,
  },
  database: {
    poolSize: 100,
    timeout: 30_000,
  },
  scraping: {
    maxConcurrent: 100,
    maxRequestRetries: 3,
  },
};
```

### Memory Management

- Adjust `maxConcurrent` based on available RAM
- Consider implementing Redis for queue management at scale

### More Scaling Considerations

1. **Database**: Switching to PostgreSQL using same SQL schema
2. **Queue**: Adding BullMQ with Redis for job management
3. **Cache**: Implementing Redis caching for frequent queries
4. **Cluster**: Using PM2 for process management

## Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Single test file
pnpm test src/__tests__/core/scrapper.test.ts
```

### MacOS Testing Note

When running tests on MacOS, you might encounter a prompt:

`"headless_shell wants to use your confidential information stored in 'Chromium Safe Storage' in your keychain"`

This is related to Chromium's security features. You can handle this in three ways:

1. **Recommended**: Allow access when prompted
   - Click "Allow" or "Always Allow"
   - This is the most secure approach

2. **Alternative**: Disable keychain prompts

   ```bash
   # Add to your shell profile (.zshrc, .bashrc, etc.)
   export CRAWLEE_HEADLESS=1
   export PLAYWRIGHT_SKIP_BROWSER_KEYCHAIN=1
   ```

   Then restart your terminal or run:

   ```bash
   source ~/.zshrc  # or your shell profile
   ```

3. **Docker Solution**: Use containerized testing

   This approach:
   - Avoids keychain prompts entirely
   - Ensures consistent test environment
   - Works across all platforms
   - Recommended for CI/CD pipelines

   Note: Make sure Docker is installed on your machine.

### API Testing

Import our [Postman Collection](./Link%20Scrapper.postman_collection.json) for API testing and examples.

## License

MIT
