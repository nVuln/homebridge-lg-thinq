import type { Config } from 'jest';
import { createDefaultEsmPreset } from 'ts-jest';

const presetConfig = createDefaultEsmPreset({
  tsconfig: './tsconfig.json',
  //...options
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
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
} satisfies Config;