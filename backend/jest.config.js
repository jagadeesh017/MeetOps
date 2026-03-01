module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!**/node_modules/**',
    '!src/config/**',
    '!src/routes/**',
    '!src/utilities/seedusers.js',
    '!server.js',
    '!check-db.js'
  ],
  coverageReporters: ['text', 'lcov', 'json'],
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js'
  ],
  verbose: true,
  testTimeout: 10000
};
