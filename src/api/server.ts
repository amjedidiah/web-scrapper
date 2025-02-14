import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import db from "../config/database";
import scale from "../config/scale";
import { LinkScraper } from "../core/scrapper";
import logger from "../lib/logger";
import initializeDatabase from "../services/initializeDB";
import { LinkEntity, LinkQueryParams } from "../types";
import { errorHandler, HttpError } from "./lib/error";
import { isValidUrl } from "./lib/helpers";

// Initialize database before starting server
initializeDatabase();

const app = express();
const port = process.env.PORT;
app.use(express.json());

// Add rate limiting middleware
const apiLimiter = rateLimit({
  windowMs: scale.rateLimiting.windowMs,
  max: scale.rateLimiting.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get(
  "/links",
  apiLimiter,
  async (
    req: Request<object, object, object, LinkQueryParams>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { minScore = "0", keyword, parentUrl, page = "1" } = req.query;
      const pageSize = scale.search.pageSize;
      const pageNumber = parseInt(page);
      if (isNaN(pageNumber) || pageNumber < 1) throw new HttpError("Invalid page parameter", 400);

      const minScoreNumber = parseFloat(minScore);
      if (isNaN(minScoreNumber)) throw new HttpError("Invalid minScore parameter", 400);

      const andStatement = parentUrl ? "AND" : "";
      const keywordCondition = keyword
        ? `${andStatement} json_extract(keywords, '$') LIKE '%' || @keyword || '%'`
        : "";

      const query = `
        WITH combined_links AS (
          SELECT * FROM links_high WHERE score >= @minScore
          UNION ALL
          SELECT * FROM links_medium WHERE score >= @minScore
          UNION ALL
          SELECT * FROM links_low WHERE score >= @minScore
        )
        SELECT * FROM combined_links
        ${[parentUrl, keyword].some(Boolean) ? "WHERE" : ""}
        ${parentUrl ? "parent_url GLOB @parentUrlWildcard" : ""}
        ${keywordCondition}
        ORDER BY score DESC
        LIMIT @limit OFFSET @offset
      `;

      const params = {
        minScore: minScoreNumber,
        ...(parentUrl && { parentUrlWildcard: `${parentUrl}*` }),
        ...(keyword && { keyword }),
        limit: pageSize,
        offset: (pageNumber - 1) * pageSize,
      };

      // Explicit type casting for database results
      const links = db.prepare(query).all(params) as LinkEntity[];

      const countQuery = `
        WITH combined_links AS (
          SELECT * FROM links_high WHERE score >= @minScore
          UNION ALL
          SELECT * FROM links_medium WHERE score >= @minScore
          UNION ALL
          SELECT * FROM links_low WHERE score >= @minScore
        )
        SELECT COUNT(*) as total FROM combined_links
        ${[parentUrl, keyword].some(Boolean) ? "WHERE" : ""}
        ${parentUrl ? "parent_url GLOB @parentUrlWildcard" : ""}
        ${keywordCondition}
      `;

      const totalCount =
        (db.prepare(countQuery).get(params) as { total: number } | undefined)?.total ?? 0;

      const formattedLinks = links.map((link) => ({
        ...link,
        keywords: JSON.parse(link.keywords) as string[],
      }));

      res.send({
        data: {
          totalResultsCount: totalCount,
          results: formattedLinks,
          page: pageNumber,
          totalPages: Math.ceil(totalCount / pageSize),
        },
        message: "Successfully retrieved links",
        error: false,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/links/:id",
  apiLimiter,
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const link = db.prepare("SELECT * FROM links WHERE id = ?").get(id) as LinkEntity | undefined;
      if (!link) throw new HttpError("Link not found", 404);

      res.send({
        data: {
          ...link,
          keywords: JSON.parse(link.keywords),
        },
        message: "Successfully retrieved link",
        error: false,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/scrape",
  apiLimiter,
  async (req: Request<object, object, { url: string }>, res: Response, next: NextFunction) => {
    const scraper = new LinkScraper();
    try {
      const url = req.body?.url;

      if (!url || !isValidUrl(url)) throw new HttpError("Valid `url` required", 400);

      const results = await scraper.scrape(url);

      res.status(202).send({
        data: {
          processed: results.length,
          estimatedScore: results.reduce((sum, link) => sum + link.score, 0),
        },
        message: "Scrape job completed",
        error: false,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Error Handler Middleware
app.use(errorHandler);

const server = app.listen(port, () => logger.info(`API running on port: ${port}`));

// Export both app and server for testing
export { app, server };
