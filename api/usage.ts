/**
 * Usage Check Endpoint
 *
 * Allows users to check their current rate limit usage without making an analysis request.
 * Returns:
 * - Current usage count
 * - Remaining analyses
 * - Total daily limit
 * - Reset time (midnight UTC)
 * - Whether user has active bypass session
 *
 * Useful for:
 * - Displaying usage in UI
 * - Checking limits before making analysis request
 * - Monitoring usage patterns
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { RateLimiter, extractUserId } from '../lib/rate-limiter';
import { log, LogLevel } from '../lib/logger';

export interface UsageResponse {
  success: boolean;
  usage?: {
    used: number;
    remaining: number;
    total: number;
    resetAt: string;
    bypassed: boolean;
  };
  error?: string;
}

/**
 * Usage check handler
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Accept both GET and POST requests
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
    return;
  }

  try {
    // Extract user ID from request
    const userId = extractUserId(req);

    if (!userId) {
      log(LogLevel.WARN, 'Usage check failed - missing user ID');
      res.status(400).json({
        success: false,
        error: 'User ID required. Include userId in request body or X-User-ID header.',
      });
      return;
    }

    // Get usage from rate limiter
    const rateLimiter = new RateLimiter();

    // Check if user has active bypass session
    const hasBypass = await rateLimiter.hasActiveBypass(userId);

    if (hasBypass) {
      log(LogLevel.INFO, 'Usage check - user has active bypass', { userId });

      res.status(200).json({
        success: true,
        usage: {
          used: 0,
          remaining: 999,
          total: 10,
          resetAt: new Date(Date.now() + 86400000).toISOString(),
          bypassed: true,
        },
      });
      return;
    }

    // Get normal usage
    const usage = await rateLimiter.getUsage(userId);

    log(LogLevel.INFO, 'Usage check successful', {
      userId,
      used: usage.count,
      remaining: usage.remaining,
    });

    res.status(200).json({
      success: true,
      usage: {
        used: usage.count,
        remaining: usage.remaining,
        total: 10,
        resetAt: usage.resetAt.toISOString(),
        bypassed: false,
      },
    });
  } catch (error) {
    log(LogLevel.ERROR, 'Usage check error', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve usage information',
    });
  }
}
