import type { Config } from 'jest';
import { createDefaultEsmPreset } from 'ts-jest';

const presetConfig = createDefaultEsmPreset({
  tsconfig: './tsconfig.json',
  diagnostics: {
    ignoreCodes: [151002],
  },
});

export default {
  ...presetConfig,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.spec.ts',
  ],
  coverageProvider: 'v8',
  testEnvironment: 'node',
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
  moduleFileExtensions: [
    'ts',
    'js',
    'json',
  ],
  coverageReporters: [
    'text',
    'lcov',
    'json-summary',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
  moduleNameMapper: {
    '^(..?/.+).js?$': '$1',
  },
  coverageThreshold: {
    global: {
      branches: 45,
      functions: 19,
      lines: 20,
      statements: 20,
    },
  },
} satisfies Config;
