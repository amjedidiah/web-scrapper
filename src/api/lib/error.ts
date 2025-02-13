import { NextFunction, Request, Response } from "express";

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
  const context = {
    url: req.originalUrl,
    method: req.method,
    statusCode,
  };

  res.status(statusCode).json({
    data: {
      ...context,
      stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
    },
    message: err.message,
    error: true,
  });

  next();
};
