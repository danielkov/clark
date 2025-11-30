/**
 * Tests for Retry Utility
 */

import { describe, it, expect, vi } from 'vitest';
import { withRetry, isRetryableError, getUserFriendlyErrorMessage } from './retry';

describe('Retry Utility', () => {
  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      
      const result = await withRetry(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');
      
      const result = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Network error'));
      
      await expect(
        withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 })
      ).rejects.toThrow('Network error');
      
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Unauthorized'));
      
      await expect(
        withRetry(fn, {
          maxAttempts: 3,
          initialDelayMs: 10,
          shouldRetry: isRetryableError,
        })
      ).rejects.toThrow('Unauthorized');
      
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('isRetryableError', () => {
    it('should not retry authentication errors', () => {
      expect(isRetryableError(new Error('Unauthorized'))).toBe(false);
      expect(isRetryableError(new Error('Authentication failed'))).toBe(false);
      expect(isRetryableError(new Error('Invalid token'))).toBe(false);
    });

    it('should not retry validation errors', () => {
      expect(isRetryableError(new Error('Validation failed'))).toBe(false);
      expect(isRetryableError(new Error('Invalid input'))).toBe(false);
      expect(isRetryableError(new Error('Bad request'))).toBe(false);
    });

    it('should retry network errors', () => {
      expect(isRetryableError(new Error('Network error'))).toBe(true);
      expect(isRetryableError(new Error('Timeout'))).toBe(true);
      expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
    });

    it('should retry rate limit errors', () => {
      expect(isRetryableError(new Error('Rate limit exceeded'))).toBe(true);
      expect(isRetryableError(new Error('Too many requests'))).toBe(true);
    });

    it('should retry server errors', () => {
      expect(isRetryableError(new Error('Internal server error'))).toBe(true);
      expect(isRetryableError(new Error('Service unavailable'))).toBe(true);
    });

    it('should handle HTTP status codes', () => {
      expect(isRetryableError({ status: 500 })).toBe(true);
      expect(isRetryableError({ status: 503 })).toBe(true);
      expect(isRetryableError({ status: 429 })).toBe(true);
      expect(isRetryableError({ status: 408 })).toBe(true);
      expect(isRetryableError({ status: 400 })).toBe(false);
      expect(isRetryableError({ status: 401 })).toBe(false);
      expect(isRetryableError({ status: 404 })).toBe(false);
    });
  });

  describe('getUserFriendlyErrorMessage', () => {
    it('should return friendly message for authentication errors', () => {
      const message = getUserFriendlyErrorMessage(new Error('Unauthorized'));
      expect(message).toBe('Authentication failed. Please log in again.');
    });

    it('should return friendly message for not found errors', () => {
      const message = getUserFriendlyErrorMessage(new Error('Not found'));
      expect(message).toBe('The requested resource was not found.');
    });

    it('should return friendly message for rate limit errors', () => {
      const message = getUserFriendlyErrorMessage(new Error('Rate limit exceeded'));
      expect(message).toBe('Too many requests. Please wait a moment and try again.');
    });

    it('should return friendly message for network errors', () => {
      const message = getUserFriendlyErrorMessage(new Error('Network error'));
      expect(message).toBe('Network error. Please check your connection and try again.');
    });

    it('should return friendly message for validation errors', () => {
      const message = getUserFriendlyErrorMessage(new Error('Validation failed'));
      expect(message).toBe('Invalid input. Please check your data and try again.');
    });

    it('should return default message for unknown errors', () => {
      const message = getUserFriendlyErrorMessage(null);
      expect(message).toBe('An unknown error occurred. Please try again.');
    });
  });
});
