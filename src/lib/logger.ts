import winston from "winston";

// Winston logger instance
const logger = winston.createLogger({
  level: process.env.DEBUG,
  transports: [new winston.transports.Console()],
  format: winston.format.combine(
    winston.format.cli(),
    // winston.format.simple(),
    // winston.format.prettyPrint() // Uncomment for more detailed info
  ),
});

export default logger;
