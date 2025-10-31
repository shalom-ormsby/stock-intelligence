/**
 * Rate Limiter for Stock Intelligence v1.0
 *
 * Implements user-level rate limiting using Upstash Redis for distributed state tracking.
 * Each user gets 10 stock analyses per day, with automatic reset at midnight UTC.
 *
 * Features:
 * - Per-user rate limiting (10 analyses/day)
 * - Distributed state tracking with Upstash Redis
 * - Automatic daily reset at midnight UTC
 * - Session-based bypass code support
 * - Development mode bypass
 * - Graceful error handling (fails open if Redis unavailable)
 */

import { log, LogLevel } from './logger';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  total: number;
  bypassed?: boolean;
}

export interface RateLimitUsage {
  count: number;
  remaining: number;
  resetAt: Date;
}

/**
 * Rate Limiter Client
 *
 * Tracks user analysis requests and enforces daily limits using Redis.
 */
export class RateLimiter {
  private redisUrl: string;
  private redisToken: string;
  private maxAnalyses: number;
  private enabled: boolean;

  constructor() {
    this.redisUrl = process.env.UPSTASH_REDIS_REST_URL || '';
    this.redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || '';
    this.maxAnalyses = parseInt(process.env.RATE_LIMIT_MAX_ANALYSES || '10');
    this.enabled = process.env.RATE_LIMIT_ENABLED !== 'false';

    if (this.enabled && (!this.redisUrl || !this.redisToken)) {
      log(
        LogLevel.ERROR,
        'Upstash Redis credentials not configured - rate limiting disabled',
        { enabled: this.enabled }
      );
      this.enabled = false;
    }
  }

  /**
   * Check if user has remaining quota, increment counter if allowed
   *
   * This is the main method called by the analyze endpoint. It checks for:
   * 1. Active bypass session (highest priority)
   * 2. Development mode bypass
   * 3. Normal rate limiting
   */
  async checkAndIncrement(userId: string): Promise<RateLimitResult> {
    // Check for active bypass session first (highest priority)
    const hasBypass = await this.hasActiveBypass(userId);
    if (hasBypass) {
      log(LogLevel.INFO, 'Request allowed via active bypass session', { userId });
      return {
        allowed: true,
        remaining: 999,
        resetAt: this.getNextMidnightUTC(),
        total: this.maxAnalyses,
        bypassed: true,
      };
    }

    // Bypass rate limiting if disabled (development mode)
    if (!this.enabled) {
      log(LogLevel.INFO, 'Rate limiting disabled - request allowed', { userId });
      return {
        allowed: true,
        remaining: 999,
        resetAt: new Date(Date.now() + 86400000),
        total: this.maxAnalyses,
      };
    }

    const key = this.getRateLimitKey(userId);
    const resetAt = this.getNextMidnightUTC();

    try {
      // Get current count
      const count = await this.getCount(key);

      log(LogLevel.INFO, 'Rate limit check', {
        userId,
        currentCount: count,
        maxAnalyses: this.maxAnalyses,
        resetAt: resetAt.toISOString(),
      });

      // Check if limit exceeded
      if (count >= this.maxAnalyses) {
        log(LogLevel.WARN, 'Rate limit exceeded', {
          userId,
          count,
          maxAnalyses: this.maxAnalyses,
        });

        return {
          allowed: false,
          remaining: 0,
          resetAt,
          total: this.maxAnalyses,
        };
      }

      // Increment counter
      await this.increment(key, resetAt);

      const remaining = this.maxAnalyses - (count + 1);

      log(LogLevel.INFO, 'Rate limit allowed', {
        userId,
        newCount: count + 1,
        remaining,
      });

      return {
        allowed: true,
        remaining,
        resetAt,
        total: this.maxAnalyses,
      };
    } catch (error) {
      // If Redis fails, allow request but log error (fail open)
      log(LogLevel.ERROR, 'Rate limiter error, allowing request', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        allowed: true,
        remaining: this.maxAnalyses,
        resetAt,
        total: this.maxAnalyses,
      };
    }
  }

  /**
   * Get current usage for a user (for usage endpoint)
   */
  async getUsage(userId: string): Promise<RateLimitUsage> {
    const key = this.getRateLimitKey(userId);
    const count = await this.getCount(key);
    const resetAt = this.getNextMidnightUTC();

    return {
      count,
      remaining: Math.max(0, this.maxAnalyses - count),
      resetAt,
    };
  }

  /**
   * Activate bypass session for user until midnight UTC
   *
   * Called by the bypass API endpoint when user enters valid bypass code.
   */
  async activateBypass(userId: string): Promise<void> {
    const key = `bypass_session:${userId}`;
    const resetAt = this.getNextMidnightUTC();
    const ttl = Math.floor((resetAt.getTime() - Date.now()) / 1000);

    try {
      // Use Redis pipeline to set value and expiry atomically
      await fetch(`${this.redisUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['SET', key, '1'],
          ['EXPIRE', key, ttl],
        ]),
      });

      log(LogLevel.INFO, 'Bypass session activated', {
        userId,
        expiresAt: resetAt.toISOString(),
      });
    } catch (error) {
      log(LogLevel.ERROR, 'Failed to activate bypass session', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if user has active bypass session
   */
  async hasActiveBypass(userId: string): Promise<boolean> {
    const key = `bypass_session:${userId}`;

    try {
      const response = await fetch(`${this.redisUrl}/get/${key}`, {
        headers: {
          Authorization: `Bearer ${this.redisToken}`,
        },
      });

      const data = (await response.json()) as { result: string | null };
      return data.result === '1';
    } catch (error) {
      log(LogLevel.ERROR, 'Error checking bypass session', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Generate Redis key for user's daily rate limit counter
   * Format: rate_limit:{userId}:{YYYY-MM-DD}
   */
  private getRateLimitKey(userId: string): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `rate_limit:${userId}:${date}`;
  }

  /**
   * Calculate next midnight UTC for automatic reset
   */
  private getNextMidnightUTC(): Date {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow;
  }

  /**
   * Get current count from Redis
   */
  private async getCount(key: string): Promise<number> {
    try {
      const response = await fetch(`${this.redisUrl}/get/${key}`, {
        headers: {
          Authorization: `Bearer ${this.redisToken}`,
        },
      });

      const data = (await response.json()) as { result: string | null };
      return data.result ? parseInt(data.result) : 0;
    } catch (error) {
      log(LogLevel.ERROR, 'Error getting count from Redis', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Increment counter in Redis with automatic expiry
   */
  private async increment(key: string, expiresAt: Date): Promise<void> {
    const ttl = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

    try {
      // Use Redis pipeline to increment and set expiry atomically
      await fetch(`${this.redisUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', key],
          ['EXPIRE', key, ttl],
        ]),
      });
    } catch (error) {
      log(LogLevel.ERROR, 'Error incrementing count in Redis', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

/**
 * Helper function to extract user ID from request
 *
 * Tries multiple sources in order of priority:
 * 1. Request body (from Notion webhook)
 * 2. X-User-ID header (for direct API calls)
 */
export function extractUserId(req: { body?: any; headers?: any }): string | null {
  // Try to get from request body first (Notion webhook)
  if (req.body?.userId) {
    return req.body.userId;
  }

  // Try to get from custom header
  if (req.headers) {
    const userId =
      req.headers['x-user-id'] ||
      req.headers['X-User-ID'] ||
      req.headers['x-notion-user-id'] ||
      req.headers['X-Notion-User-ID'];

    if (userId) {
      return userId;
    }
  }

  return null;
}

/**
 * Helper function to calculate seconds until next midnight UTC
 */
export function getSecondsUntilMidnightUTC(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return Math.floor((tomorrow.getTime() - now.getTime()) / 1000);
}
