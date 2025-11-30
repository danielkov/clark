/**
 * Retry Utility with Exponential Backoff
 * 
 * Provides retry logic for API calls with exponential backoff
 */

import { logger } from '@/lib/datadog/logger';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  shouldRetry: () => true,
};

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number
): number {
  const delay = initialDelay * Math.pow(multiplier, attempt - 1);
  return Math.min(delay, maxDelay);
}

/**
 * Retry an async function with exponential backoff
 * 
 * @param fn The async function to retry
 * @param options Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry this error
      if (!opts.shouldRetry(error)) {
        throw error;
      }

      // If this was the last attempt, throw the error
      if (attempt === opts.maxAttempts) {
        throw error;
      }

      // Calculate delay and wait before retrying
      const delay = calculateDelay(
        attempt,
        opts.initialDelayMs,
        opts.maxDelayMs,
        opts.backoffMultiplier
      );

      logger.warn('Retry attempt failed, retrying', {
        attempt,
        maxAttempts: opts.maxAttempts,
        delayMs: delay,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Determine if an error is retryable
 * Network errors, timeouts, and rate limits are retryable
 * Authentication errors and validation errors are not
 */
export function isRetryableError(error: unknown): boolean {
  if (!error) return false;

  // Handle Error objects
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Don't retry authentication errors
    if (
      message.includes('unauthorized') ||
      message.includes('authentication') ||
      message.includes('invalid token') ||
      message.includes('not authorized')
    ) {
      return false;
    }

    // Don't retry validation errors
    if (
      message.includes('validation') ||
      message.includes('invalid input') ||
      message.includes('bad request')
    ) {
      return false;
    }

    // Retry network errors
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('etimedout')
    ) {
      return true;
    }

    // Retry rate limit errors
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return true;
    }

    // Retry server errors (5xx)
    if (message.includes('internal server error') || message.includes('service unavailable')) {
      return true;
    }
  }

  // Handle HTTP response objects
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status;

    // Don't retry client errors (4xx) except 429 (rate limit) and 408 (timeout)
    if (status >= 400 && status < 500 && status !== 429 && status !== 408) {
      return false;
    }

    // Retry server errors (5xx) and rate limits
    if (status >= 500 || status === 429 || status === 408) {
      return true;
    }
  }

  // Default to retrying unknown errors
  return true;
}

/**
 * User-friendly error messages for common error types
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
  if (!error) {
    return 'An unknown error occurred. Please try again.';
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('unauthorized') || message.includes('authentication')) {
      return 'Authentication failed. Please log in again.';
    }

    if (message.includes('not found')) {
      return 'The requested resource was not found.';
    }

    if (message.includes('rate limit') || message.includes('too many requests')) {
      return 'Too many requests. Please wait a moment and try again.';
    }

    if (message.includes('network') || message.includes('timeout')) {
      return 'Network error. Please check your connection and try again.';
    }

    if (message.includes('validation') || message.includes('invalid')) {
      return 'Invalid input. Please check your data and try again.';
    }

    if (message.includes('internal server error') || message.includes('service unavailable')) {
      return 'Service temporarily unavailable. Please try again later.';
    }

    // Return the original error message if it's user-friendly
    if (error.message && error.message.length < 200) {
      return error.message;
    }
  }

  return 'An unexpected error occurred. Please try again.';
}
