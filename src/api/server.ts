import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import db from "../config/database";
import scale from "../config/scale";
import { LinkScraper } from "../core/scrapper";
import { LinkRepository } from "../storage/LinkRepository";
import { LinkEntity, LinkQueryParams } from "../types";
import { errorHandler, HttpError } from "./lib/error";
import { isValidUrl } from "./lib/helpers";

const app = express();
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
      const { minScore = "0.5", keyword, parentUrl } = req.query;

      const minScoreNumber = parseFloat(minScore);
      if (isNaN(minScoreNumber)) throw new HttpError("Invalid minScore parameter", 400);

      let query = `SELECT * FROM links WHERE score >= @minScore`;
      const params: Record<string, string | number> = { minScore: minScoreNumber };

      if (parentUrl) {
        query += ` AND parent_url = @parentUrl`;
        params.parentUrl = parentUrl;
      }

      if (keyword) {
        query += ` AND EXISTS (SELECT 1 FROM json_each(keywords) WHERE value LIKE @keyword)`;
        params.keyword = `%${keyword}%`;
      }

      // Explicit type casting for database results
      const links = db.prepare(query).all(params) as LinkEntity[];

      const formattedLinks = links.map((link) => ({
        ...link,
        keywords: JSON.parse(link.keywords) as string[],
      }));

      res.send({
        data: {
          count: links.length,
          results: formattedLinks,
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
    try {
      const url = req.body?.url;
      const scraper = new LinkScraper();
      const repository = new LinkRepository();

      console.log({ url }, req.body);
      if (!url || !isValidUrl(url)) throw new HttpError("Valid `url` required", 400);

      const results = await scraper.scrape(url);
      await repository.bulkInsert(
        results.map((link) => ({
          ...link,
          parentUrl: url,
        })),
      );

      res.status(202).json({
        data: {
          processed: results.length,
          estimatedScore: results.reduce((sum, link) => sum + link.score, 0),
        },
        message: "Scrape job initiated",
        error: false,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Error Handler Middleware
app.use(errorHandler);

app.listen(3000, () => {
  console.info("API running on port 3000");
});
