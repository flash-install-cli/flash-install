/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {},
  // Don't transform any files - run tests in CommonJS mode
  transformIgnorePatterns: ['/node_modules/', '/dist/'],
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '\\._'],
  moduleNameMapper: {
    // Map ES modules to CommonJS wrappers for tests
    '^../dist/cloud/cloud-cache.js$': '<rootDir>/src/cloud/cloud-cache.cjs',
    '^../dist/cloud/provider-factory.js$': '<rootDir>/src/cloud/provider-factory.cjs',
    '^../dist/cloud/s3-provider.js$': '<rootDir>/src/cloud/s3-provider.cjs',
    '^../dist/install.js$': '<rootDir>/src/install.cjs',
    '^../dist/cache.js$': '<rootDir>/src/cache.cjs',
    '^../dist/tui/index.js$': '<rootDir>/src/tui/index.cjs',
  },
  // Setup files to run before tests
  setupFiles: ['<rootDir>/tests/setup.js']
};
