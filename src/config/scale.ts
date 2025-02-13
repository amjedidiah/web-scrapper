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
  },
  search: {
    pageSize: 100,
  },
};

export default scale;
