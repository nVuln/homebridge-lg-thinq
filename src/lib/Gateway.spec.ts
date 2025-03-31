import { Gateway, GatewayData } from './Gateway';
import { describe, test, expect, beforeEach } from '@jest/globals';

describe('Gateway', () => {
  const mockData: GatewayData = {
    empTermsUri: 'https://example.com/terms',
    empSpxUri: 'https://example.com/login',
    thinq2Uri: 'https://example.com/thinq2',
    thinq1Uri: 'https://example.com/thinq1',
    countryCode: 'US',
    languageCode: 'en-US',
  };

  let gateway: Gateway;

  beforeEach(() => {
    gateway = new Gateway(mockData);
  });

  test('should return the correct emp_base_url', () => {
    expect(gateway.emp_base_url).toBe('https://example.com/terms/');
  });

  test('should return the correct login_base_url', () => {
    expect(gateway.login_base_url).toBe('https://example.com/login/');
  });

  test('should return the correct thinq2_url', () => {
    expect(gateway.thinq2_url).toBe('https://example.com/thinq2/');
  });

  test('should return the correct thinq1_url', () => {
    expect(gateway.thinq1_url).toBe('https://example.com/thinq1/');
  });

  test('should return the correct country_code', () => {
    expect(gateway.country_code).toBe('US');
  });

  test('should return the correct language_code', () => {
    expect(gateway.language_code).toBe('en-US');
  });
});
