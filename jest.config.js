module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testTimeout: 45_000, // Global 45s timeout
  globalSetup: "<rootDir>/src/jest.global-setup.ts",
  testEnvironmentOptions: {
    NODE_ENV: "test",
  },
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  transformIgnorePatterns: [
    // Update this if there are no non-ESM dependencies
    "node_modules/(?!(ulid|better-sqlite3)/)",
  ],
};
