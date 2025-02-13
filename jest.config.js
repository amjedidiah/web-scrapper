module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testTimeout: 30_000, // Global 30s timeout
  globalSetup: "<rootDir>/src/jest.global-setup.ts",
  testEnvironmentOptions: {
    NODE_ENV: "test",
  },
  setupFiles: ["<rootDir>/jest.setup.js"],
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  transformIgnorePatterns: [
    // Update this if you have non-ESM dependencies
    "node_modules/(?!(ulid|better-sqlite3)/)",
  ],
};
