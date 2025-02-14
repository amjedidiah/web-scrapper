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
