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
  collectCoverageFrom: ['src/**'],
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
  ],
  moduleNameMapper: {
    '^(..?/.+).js?$': '$1',
  },
  coverageThreshold: {
    global: {
      branches: 5,
      functions: 10,
      lines: 10,
      statements: 10,
    },
  },
} satisfies Config;