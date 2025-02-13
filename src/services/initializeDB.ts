import { execSync } from "child_process";
import logger from "../api/lib/logger";
import db from "../config/database";

export default function initializeDatabase() {
  try {
    // Run init script with fresh connection
    execSync("ts-node src/scripts/initDB.ts", {
      stdio: "inherit",
      env: { ...process.env, FORCE_DB_REINIT: "true" },
    });

    // Verify tables exist
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'links_%'`)
      .all() as Array<{ name: string }>;

    if (tables.length !== 3) throw new Error(`Expected 3 shard tables, found ${tables.length}`);

    logger.info("✅ Database initialized successfully");
  } catch (error) {
    logger.error("❌ Database initialization failed:", error);
    process.exit(1);
  }
}
