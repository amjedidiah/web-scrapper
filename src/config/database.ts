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
