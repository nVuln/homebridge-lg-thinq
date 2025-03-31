import { describe, beforeEach, test, expect } from '@jest/globals';
import { Session } from '../../src/lib/Session';

describe('Session', () => {
  let session: Session;
  const accessToken = 'testAccessToken';
  const refreshToken = 'testRefreshToken';
  const validExpiresIn = Math.round(Date.now() / 1000) + 3600; // 1 hour from now
  const expiredExpiresIn = Math.round(Date.now() / 1000) - 3600; // 1 hour ago

  beforeEach(() => {
    session = new Session(accessToken, refreshToken, validExpiresIn);
  });

  test('should initialize with correct values', () => {
    expect(session.accessToken).toBe(accessToken);
    expect(session.refreshToken).toBe(refreshToken);
    expect(session.hasToken()).toBe(true);
    expect(session.isTokenExpired()).toBe(false);
    expect(session.hasValidToken()).toBe(true);
  });

  test('should detect expired token', () => {
    const expiredSession = new Session(accessToken, refreshToken, expiredExpiresIn);
    expect(expiredSession.isTokenExpired()).toBe(true);
    expect(expiredSession.hasValidToken()).toBe(false);
  });

  test('should update token and expiration', () => {
    const newAccessToken = 'newAccessToken';
    const newExpiresIn = Math.round(Date.now() / 1000) + 7200; // 2 hours from now

    session.newToken(newAccessToken, newExpiresIn);

    expect(session.accessToken).toBe(newAccessToken);
    expect(session.isTokenExpired()).toBe(false);
    expect(session.hasValidToken()).toBe(true);
  });

  test('should return false for hasToken when access token is empty', () => {
    const emptyTokenSession = new Session('', refreshToken, validExpiresIn);
    expect(emptyTokenSession.hasToken()).toBe(false);
    expect(emptyTokenSession.hasValidToken()).toBe(false);
  });

  test('should correctly handle static getCurrentEpoch', () => {
    const currentEpoch = Math.round(Date.now() / 1000);
    expect(Session['getCurrentEpoch']()).toBeCloseTo(currentEpoch, -1); // Allow slight time difference
  });
});
