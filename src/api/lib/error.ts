import { NextFunction, Request, Response } from "express";
import logger from "./logger";

// Error class for structured error handling
export class HttpError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
  ) {
    super(message);
  }
}

// Error handling middleware
export const errorHandler = (
  err: Error | HttpError,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const statusCode = err instanceof HttpError ? err.statusCode : 500;
  logger.error(`[${new Date().toISOString()}] Error: ${err.message}`);

  res.status(statusCode).json({
    data: null,
    message: err.message,
    error: true,
  });

  next();
};
