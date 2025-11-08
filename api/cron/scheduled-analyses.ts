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
import { getAllUsers, User, decryptToken } from '../../lib/auth';
import { Client } from '@notionhq/client';

// Environment variables
const CRON_SECRET = process.env.CRON_SECRET || '';
const STOCK_ANALYSES_DB_ID = process.env.STOCK_ANALYSES_DB_ID || '';

// Tier limits for scheduled analyses
const TIER_LIMITS: Record<string, number> = {
  Free: 10,
  Starter: 50,
  Analyst: 200,
  Pro: Infinity,
};

// Stock page interface
interface StockPage {
  id: string;
  ticker: string;
  lastAutoAnalysis?: string;
}

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
 * Query stocks with Daily cadence for a specific user
 */
async function getStocksForScheduledAnalysis(
  userAccessToken: string,
  limit: number
): Promise<StockPage[]> {
  if (!STOCK_ANALYSES_DB_ID) {
    throw new Error('STOCK_ANALYSES_DB_ID not configured');
  }

  const notion = new Client({ auth: userAccessToken });

  try {
    const response = await notion.databases.query({
      database_id: STOCK_ANALYSES_DB_ID,
      filter: {
        property: 'Analysis Cadence',
        select: { equals: 'Daily' },
      },
      sorts: [
        { property: 'Last Auto-Analysis', direction: 'ascending' }, // Oldest first
      ],
      page_size: limit,
    });

    return response.results.map((page: any) => {
      const props = page.properties;
      return {
        id: page.id,
        ticker: props.Ticker?.title?.[0]?.text?.content || '',
        lastAutoAnalysis: props['Last Auto-Analysis']?.date?.start,
      };
    });
  } catch (error) {
    console.error('[CRON] Failed to query stocks:', error);
    throw error;
  }
}

/**
 * Execute analysis for a single stock
 *
 * For v1.0.4, we use a simplified approach: trigger the analysis via
 * internal function import to avoid HTTP complexity
 */
async function analyzeStock(
  ticker: string,
  user: User
): Promise<boolean> {
  try {
    // Import the analyze handler
    const analyzeHandler = (await import('../analyze')).default;

    // Create a mock request object that mimics the analyze API
    const mockReq = {
      method: 'POST',
      body: {
        ticker,
        timezone: user.timezone,
        usePollingWorkflow: true,
      },
      headers: {
        // Pass user email for session lookup
        'x-cron-user-email': user.email,
      },
    } as any as VercelRequest;

    // Create a mock response object to capture the result
    let responseData: any = null;
    let statusCode = 200;

    const mockRes = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (data: any) => {
        responseData = data;
      },
      end: () => {},
    } as any as VercelResponse;

    // Call the analyze handler
    await analyzeHandler(mockReq, mockRes);

    // Check if analysis succeeded
    return statusCode === 200 && responseData?.success === true;
  } catch (error) {
    console.error(`[CRON] Failed to analyze ${ticker}:`, error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Update Last Auto-Analysis timestamp for a stock
 */
async function updateLastAutoAnalysis(
  userAccessToken: string,
  pageId: string
): Promise<void> {
  const notion = new Client({ auth: userAccessToken });

  try {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        'Last Auto-Analysis': {
          date: {
            start: new Date().toISOString(),
          },
        },
      },
    });
  } catch (error) {
    console.error('[CRON] Failed to update Last Auto-Analysis:', error);
    throw error;
  }
}

/**
 * Run scheduled analyses for a single user
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

  try {
    // Decrypt user's OAuth access token
    const userAccessToken = await decryptToken(user.accessToken);

    // Query stocks with Daily cadence
    const stocks = await getStocksForScheduledAnalysis(userAccessToken, stockLimit);
    console.log(`[CRON]   → Found ${stocks.length} stocks with Daily cadence`);

    if (stocks.length === 0) {
      console.log(`[CRON]   → No stocks to analyze`);
      return {
        userId: user.id,
        email: user.email,
        tier,
        stockLimit,
        analyzed: 0,
        skipped: 0,
        failed: 0,
      };
    }

    // Execute analyses
    let analyzed = 0;
    let failed = 0;

    for (const stock of stocks) {
      if (!stock.ticker) {
        console.log(`[CRON]   → Skipping stock ${stock.id} (no ticker)`);
        failed++;
        continue;
      }

      console.log(`[CRON]   → Analyzing ${stock.ticker}...`);

      const success = await analyzeStock(stock.ticker, user);

      if (success) {
        // Update Last Auto-Analysis timestamp
        await updateLastAutoAnalysis(userAccessToken, stock.id);
        analyzed++;
        console.log(`[CRON]   → ✓ ${stock.ticker} analyzed successfully`);
      } else {
        failed++;
        console.log(`[CRON]   → ✗ ${stock.ticker} analysis failed`);
      }
    }

    const skipped = Math.max(0, stocks.length - analyzed - failed);

    console.log(`[CRON]   → Summary: ${analyzed} analyzed, ${failed} failed, ${skipped} skipped`);

    return {
      userId: user.id,
      email: user.email,
      tier,
      stockLimit,
      analyzed,
      skipped,
      failed,
    };
  } catch (error) {
    console.error(`[CRON] Error processing user ${user.email}:`, error);
    return {
      userId: user.id,
      email: user.email,
      tier,
      stockLimit,
      analyzed: 0,
      skipped: 0,
      failed: 1,
    };
  }
}
