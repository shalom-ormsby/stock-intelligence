/**
 * Scheduled Stock Analyses Cron Endpoint (v1.0.4)
 *
 * Runs daily at 6am PT (14:00 UTC) via Vercel Cron
 * Automatically analyzes stocks with "Daily" cadence for all users
 *
 * Workflow:
 * 1. Verify cron secret (authentication)
 * 2. Check if today is a NYSE market day (skip weekends/holidays)
 * 3. Get all beta users
 * 4. For each user:
 *    - Query stocks with Analysis Cadence = "Daily"
 *    - Apply tier limits (Free=10, Starter=50, Analyst=200, Pro=unlimited)
 *    - Execute analyses
 *    - Update Last Auto-Analysis timestamps
 * 5. Return execution summary
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { getAllUsers } from '../../lib/auth';
import { runOrchestrator } from '../../lib/orchestrator';

// Environment variables
const CRON_SECRET = process.env.CRON_SECRET || '';

// Note: Tier limits are now enforced in the Stock Analyses database
// via the "Analysis Cadence" property. Orchestrator processes all stocks
// marked as "Daily" regardless of tier limits.

/**
 * Main cron handler
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  console.log('[CRON] Scheduled analyses started');

  try {
    // 1. Verify cron secret
    const authHeader = req.headers.authorization;
    const providedSecret = authHeader?.replace('Bearer ', '');

    if (!providedSecret || providedSecret !== CRON_SECRET) {
      console.error('[CRON] Unauthorized - invalid cron secret');
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid cron secret'
      });
      return;
    }

    console.log('[CRON] ✓ Cron secret verified');

    // 2. Check if today is a market day
    const isMarketDay = await checkNYSEMarketDay();

    if (!isMarketDay) {
      console.log('[CRON] Market closed today (weekend or holiday) - skipping execution');
      res.json({
        success: true,
        message: 'Market closed today',
        marketDay: false,
        executed: 0,
        skipped: 0,
        failed: 0
      });
      return;
    }

    console.log('[CRON] ✓ Market is open today');

    // 3. Get all beta users
    const users = await getAllUsers();
    console.log(`[CRON] Found ${users.length} users`);

    // 4. Run orchestrator (v1.0.5)
    const metrics = await runOrchestrator(users);

    // 5. Return execution summary
    const summary = {
      success: true,
      marketDay: true,
      totalUsers: users.length,
      totalTickers: metrics.totalTickers,
      totalSubscribers: metrics.totalSubscribers,
      analyzed: metrics.analyzed,
      failed: metrics.failed,
      broadcasts: {
        total: metrics.totalBroadcasts,
        successful: metrics.successfulBroadcasts,
        failed: metrics.failedBroadcasts,
      },
      apiCallsSaved: metrics.apiCallsSaved,
      durationMs: metrics.durationMs,
      durationSec: (metrics.durationMs / 1000).toFixed(1),
    };

    console.log('[CRON] ✓ Scheduled analyses complete:', JSON.stringify(summary, null, 2));
    res.json(summary);

  } catch (error) {
    console.error('[CRON] Fatal error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Check if today is a NYSE market day
 * Returns false for weekends and major holidays
 *
 * TODO v1.0.5: Add FMP holidays API integration
 */
async function checkNYSEMarketDay(): Promise<boolean> {
  const today = new Date();

  // Check if weekend (Saturday=6, Sunday=0)
  const dayOfWeek = today.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    console.log('[CRON] Weekend detected - market closed');
    return false;
  }

  // Check hardcoded 2025 holidays
  const dateStr = today.toISOString().split('T')[0];
  const holidays2025 = [
    '2025-01-01', // New Year's Day
    '2025-01-20', // MLK Day
    '2025-02-17', // Presidents Day
    '2025-04-18', // Good Friday
    '2025-05-26', // Memorial Day
    '2025-07-04', // Independence Day
    '2025-09-01', // Labor Day
    '2025-11-27', // Thanksgiving
    '2025-12-25'  // Christmas
  ];

  if (holidays2025.includes(dateStr)) {
    console.log(`[CRON] Holiday detected (${dateStr}) - market closed`);
    return false;
  }

  return true;
}

// Note: All analysis logic now handled by orchestrator (lib/orchestrator.ts)
// Old per-user sequential processing functions have been removed in v1.0.5
