/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/modules/auth/**/*.ts',
    'src/modules/providers/**/*.ts',
    'src/modules/bookings/**/*.ts',
    'src/modules/job-posts/**/*.ts',
    'src/jobs/systemJobs.ts',
    'src/middleware/authenticate.ts',
    'src/middleware/authorize.ts',
  ],
  coveragePathIgnorePatterns: ['auth.routes.ts'],
  setupFiles: ['<rootDir>/src/test/setupEnv.ts'],
  clearMocks: true,
};
