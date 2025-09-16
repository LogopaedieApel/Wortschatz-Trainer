module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  verbose: false,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};