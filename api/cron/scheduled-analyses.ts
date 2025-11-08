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
 *
 * Current Status: SKELETON - Mock execution for testing
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { getAllUsers, User } from '../../lib/auth';

// Environment variables
const CRON_SECRET = process.env.CRON_SECRET || '';

// Tier limits for scheduled analyses
const TIER_LIMITS: Record<string, number> = {
  Free: 10,
  Starter: 50,
  Analyst: 200,
  Pro: Infinity,
};

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

    // 4. Execute analyses for each user (MOCK for now)
    const results = [];
    for (const user of users) {
      const userResult = await runScheduledAnalysesForUser(user);
      results.push(userResult);
    }

    // 5. Return execution summary
    const summary = {
      success: true,
      marketDay: true,
      totalUsers: users.length,
      executed: results.reduce((sum, r) => sum + r.analyzed, 0),
      skipped: results.reduce((sum, r) => sum + r.skipped, 0),
      failed: results.reduce((sum, r) => sum + r.failed, 0),
      results
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

/**
 * Run scheduled analyses for a single user (SKELETON - MOCK EXECUTION)
 *
 * Current: Logs what WOULD be analyzed without actually running analyses
 * TODO: Add actual stock query and analysis execution
 */
async function runScheduledAnalysesForUser(user: User): Promise<{
  userId: string;
  email: string;
  tier: string;
  stockLimit: number;
  analyzed: number;
  skipped: number;
  failed: number;
}> {
  const tier = user.subscriptionTier || 'Free';
  const stockLimit = TIER_LIMITS[tier];

  console.log(`[CRON] Processing user: ${user.email} (${tier} tier, limit: ${stockLimit})`);

  // MOCK: Simulate finding stocks to analyze
  // TODO: Replace with actual Notion query
  const mockStocksCount = Math.min(Math.floor(Math.random() * 5) + 1, stockLimit);

  console.log(`[CRON]   → MOCK: Would analyze ${mockStocksCount} stocks`);
  console.log(`[CRON]   → MOCK: Would update Last Auto-Analysis timestamps`);

  return {
    userId: user.id,
    email: user.email,
    tier,
    stockLimit,
    analyzed: mockStocksCount, // MOCK - actual count will be real analyses
    skipped: 0, // Will be non-zero when hitting tier limits
    failed: 0  // Will track actual failures
  };
}
