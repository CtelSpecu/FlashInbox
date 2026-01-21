import { describe, expect, test } from 'bun:test';
import {
  generateKey,
  generateSessionToken,
  hashKey,
  hashToken,
  timingSafeEqual,
  generateUUID,
  hashRateLimitKey,
  hashUserAgent,
} from '@/lib/utils/crypto';

describe('crypto utilities', () => {
  describe('generateKey', () => {
    test('generates 32 character key', () => {
      const key = generateKey();
      expect(key.length).toBe(32);
    });

    test('generates alphanumeric key without ambiguous characters', () => {
      const key = generateKey();
      // Should not contain: 0, 1, O, l, I (ambiguous)
      expect(key).not.toMatch(/[01OlI]/);
      // Should only contain allowed characters
      expect(key).toMatch(/^[A-HJ-NP-Za-hj-np-z2-9]+$/);
    });

    test('generates unique keys', () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        keys.add(generateKey());
      }
      expect(keys.size).toBe(100);
    });
  });

  describe('generateSessionToken', () => {
    test('generates 64 character hex token', () => {
      const token = generateSessionToken();
      expect(token.length).toBe(64);
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    test('generates unique tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateSessionToken());
      }
      expect(tokens.size).toBe(100);
    });
  });

  describe('hashKey', () => {
    test('produces consistent hash with same input', async () => {
      const key = 'testKey123';
      const pepper = 'testPepper';
      const hash1 = await hashKey(key, pepper);
      const hash2 = await hashKey(key, pepper);
      expect(hash1).toBe(hash2);
    });

    test('produces different hash with different pepper', async () => {
      const key = 'testKey123';
      const hash1 = await hashKey(key, 'pepper1');
      const hash2 = await hashKey(key, 'pepper2');
      expect(hash1).not.toBe(hash2);
    });

    test('produces 64 character hex hash', async () => {
      const hash = await hashKey('test', 'pepper');
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('hashToken', () => {
    test('produces consistent hash', async () => {
      const token = 'testToken';
      const hash1 = await hashToken(token);
      const hash2 = await hashToken(token);
      expect(hash1).toBe(hash2);
    });

    test('produces 64 character hex hash', async () => {
      const hash = await hashToken('test');
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('timingSafeEqual', () => {
    test('returns true for equal strings', () => {
      expect(timingSafeEqual('abc', 'abc')).toBe(true);
      expect(timingSafeEqual('', '')).toBe(true);
      expect(timingSafeEqual('a'.repeat(100), 'a'.repeat(100))).toBe(true);
    });

    test('returns false for different strings', () => {
      expect(timingSafeEqual('abc', 'abd')).toBe(false);
      expect(timingSafeEqual('abc', 'abcd')).toBe(false);
      expect(timingSafeEqual('abc', '')).toBe(false);
    });

    test('returns false for different length strings (early exit)', () => {
      expect(timingSafeEqual('short', 'longer string')).toBe(false);
    });
  });

  describe('generateUUID', () => {
    test('generates valid UUID v4 format', () => {
      const uuid = generateUUID();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    test('generates unique UUIDs', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }
      expect(uuids.size).toBe(100);
    });
  });

  describe('hashRateLimitKey', () => {
    test('produces consistent hash for same inputs', async () => {
      const hash1 = await hashRateLimitKey('1.1.1.1', 'AS12345', 'ua123', 'create');
      const hash2 = await hashRateLimitKey('1.1.1.1', 'AS12345', 'ua123', 'create');
      expect(hash1).toBe(hash2);
    });

    test('produces different hash for different actions', async () => {
      const hash1 = await hashRateLimitKey('1.1.1.1', 'AS12345', 'ua123', 'create');
      const hash2 = await hashRateLimitKey('1.1.1.1', 'AS12345', 'ua123', 'claim');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('hashUserAgent', () => {
    test('produces 8 character hash', async () => {
      const hash = await hashUserAgent('Mozilla/5.0 Test');
      expect(hash.length).toBe(8);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    test('produces consistent hash', async () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0)';
      const hash1 = await hashUserAgent(ua);
      const hash2 = await hashUserAgent(ua);
      expect(hash1).toBe(hash2);
    });
  });
});

