/**
 * Bypass Code Activation Endpoint
 *
 * Allows users to activate unlimited analyses for the day by entering a bypass code.
 * The bypass code is stored in the RATE_LIMIT_BYPASS_CODE environment variable.
 *
 * Session-based approach:
 * 1. User enters bypass code once (in Settings page UI)
 * 2. Backend validates code and stores session in Redis
 * 3. Session lasts until midnight UTC (automatic expiry)
 * 4. All subsequent analyses automatically bypass rate limits
 *
 * Security:
 * - Code validated server-side only
 * - Session stored in Redis with automatic TTL
 * - All activation attempts logged
 * - Code easily changeable via environment variable
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { RateLimiter } from '../lib/rate-limiter';
import { log, LogLevel } from '../lib/logger';

interface BypassRequest {
  userId: string;
  code: string;
}

export interface BypassResponse {
  success: boolean;
  message?: string;
  expiresAt?: string;
  error?: string;
}

/**
 * Helper function to calculate next midnight UTC
 */
function getNextMidnightUTC(): Date {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow;
}

/**
 * Bypass code activation handler
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

  // Only accept POST requests
  if (req.method !== 'POST') {
    res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
    return;
  }

  try {
    // Parse request body
    const body: BypassRequest =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const { userId, code } = body;

    // Validate required fields
    if (!userId || !code) {
      log(LogLevel.WARN, 'Bypass activation failed - missing fields', {
        hasUserId: !!userId,
        hasCode: !!code,
      });

      res.status(400).json({
        success: false,
        error: 'User ID and bypass code are required',
      });
      return;
    }

    // Validate bypass code
    const validCode = process.env.RATE_LIMIT_BYPASS_CODE;

    if (!validCode) {
      log(LogLevel.ERROR, 'Bypass code not configured in environment variables');
      res.status(500).json({
        success: false,
        error: 'Bypass code feature not configured',
      });
      return;
    }

    if (code !== validCode) {
      log(LogLevel.WARN, 'Invalid bypass code attempt', {
        userId,
        codeLength: code.length,
        ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      });

      res.status(401).json({
        success: false,
        error: 'Invalid bypass code',
      });
      return;
    }

    // Activate bypass session in Redis
    const rateLimiter = new RateLimiter();
    await rateLimiter.activateBypass(userId);

    const expiresAt = getNextMidnightUTC();

    log(LogLevel.INFO, 'Bypass session activated successfully', {
      userId,
      expiresAt: expiresAt.toISOString(),
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    });

    res.status(200).json({
      success: true,
      message: 'Unlimited access activated until midnight UTC',
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    log(LogLevel.ERROR, 'Bypass activation error', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to activate bypass session',
    });
  }
}
