/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.test.json",
      },
    ],
  },
  moduleNameMapper: {
    "^@sentinel/gateway-core(.*)$":
      "<rootDir>/packages/gateway-core/src$1",
    "^@sentinel/whatsapp-client(.*)$":
      "<rootDir>/packages/whatsapp-client/src$1",
    "^@sentinel/telegram-client(.*)$":
      "<rootDir>/packages/telegram-client/src$1",
    "^@sentinel/concierge(.*)$":
      "<rootDir>/packages/concierge/src$1",
    "^@sentinel/cook(.*)$": "<rootDir>/packages/cook/src$1",
  },
};
