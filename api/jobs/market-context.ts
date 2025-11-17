/**
 * Market Context Job Endpoint (v1.1.0)
 *
 * Runs daily at 5:00 AM PT (13:00 UTC) via Vercel Cron
 * Creates Market Context pages in each user's Notion workspace
 *
 * Workflow:
 * 1. Verify cron secret (authentication)
 * 2. Check if today is a NYSE market day (skip weekends/holidays)
 * 3. Fetch market context from FMP + FRED APIs (once, cached)
 * 4. Get all beta users
 * 5. For each user, create Market Context page in their database
 * 6. Return execution summary
 *
 * Architecture: Per-user distribution (Option 2)
 * - Each user has their own Market Context database (from template)
 * - Cron creates one page per user
 * - Uses each user's OAuth access token
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@notionhq/client';
import { getAllUsers, decryptToken } from '../../lib/auth';
import { getMarketContext, MarketContext } from '../../lib/market';
import { createFMPClient } from '../../lib/fmp-client';
import { createFREDClient } from '../../lib/fred-client';

// Vercel function configuration
export const maxDuration = 120; // 2 minutes (need time for per-user distribution)

// Environment variables
const CRON_SECRET = process.env.CRON_SECRET || '';
const FMP_API_KEY = process.env.FMP_API_KEY || '';
const FRED_API_KEY = process.env.FRED_API_KEY || '';

/**
 * Main cron handler
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  console.log('[MARKET JOB] Market context distribution started');

  try {
    // 1. Verify cron secret
    const authHeader = req.headers.authorization;
    const providedSecret = authHeader?.replace('Bearer ', '');

    if (!providedSecret || providedSecret !== CRON_SECRET) {
      console.error('[MARKET JOB] Unauthorized - invalid cron secret');
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid cron secret'
      });
      return;
    }

    console.log('[MARKET JOB] ✓ Cron secret verified');

    // 2. Check environment variables
    if (!FMP_API_KEY || !FRED_API_KEY) {
      console.error('[MARKET JOB] Missing required API keys');
      res.status(500).json({
        success: false,
        error: 'Configuration error',
        message: 'Missing FMP or FRED API keys',
      });
      return;
    }

    // 3. Check if today is a market day
    const isMarketDay = await checkNYSEMarketDay();

    if (!isMarketDay) {
      console.log('[MARKET JOB] Market closed today (weekend or holiday) - skipping execution');
      res.json({
        success: true,
        message: 'Market closed today',
        marketDay: false,
        created: 0,
        failed: 0,
      });
      return;
    }

    console.log('[MARKET JOB] ✓ Market is open today');

    // 4. Fetch market context ONCE (will be distributed to all users)
    const fmpClient = createFMPClient(FMP_API_KEY);
    const fredClient = createFREDClient(FRED_API_KEY);

    console.log('[MARKET JOB] Fetching market context...');
    const marketContext = await getMarketContext(fmpClient, fredClient, true); // Force refresh

    console.log(`[MARKET JOB] ✓ Market context fetched: ${marketContext.regime} regime (${Math.round(marketContext.regimeConfidence * 100)}% confidence)`);

    // 5. Get all users
    const users = await getAllUsers();
    console.log(`[MARKET JOB] Found ${users.length} users`);

    // 6. Distribute market context to each user's database
    const results = await distributeMarketContext(users, marketContext);

    // 7. Return success summary
    const summary = {
      success: true,
      marketDay: true,
      totalUsers: users.length,
      created: results.created,
      failed: results.failed,
      skipped: results.skipped,
      context: {
        date: marketContext.date,
        regime: marketContext.regime,
        confidence: Math.round(marketContext.regimeConfidence * 100),
        riskAssessment: marketContext.riskAssessment,
        vix: marketContext.vix.toFixed(1),
        spyChange1D: marketContext.spy.change1D.toFixed(2),
      }
    };

    console.log('[MARKET JOB] ✓ Market context distribution complete:', JSON.stringify(summary, null, 2));
    res.json(summary);

  } catch (error) {
    console.error('[MARKET JOB] Fatal error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Distribute market context to all users
 */
async function distributeMarketContext(
  users: any[],
  marketContext: MarketContext
): Promise<{ created: number; failed: number; skipped: number }> {
  let created = 0;
  let failed = 0;
  let skipped = 0;

  for (const user of users) {
    try {
      // Skip if user doesn't have Market Context database configured
      if (!user.marketContextDbId) {
        console.log(`[MARKET JOB] Skipping ${user.email} - no Market Context DB ID`);
        skipped++;
        continue;
      }

      // Decrypt user's access token
      const accessToken = await decryptToken(user.accessToken);

      // Create Notion client with user's OAuth token
      const notion = new Client({ auth: accessToken });

      // Check if page already exists for today
      const today = marketContext.date;
      const existingPage = await checkExistingMarketContext(notion, user.marketContextDbId, today);

      if (existingPage) {
        console.log(`[MARKET JOB] Skipping ${user.email} - already has context for ${today}`);
        skipped++;
        continue;
      }

      // Create market context page
      await createMarketContextPage(notion, user.marketContextDbId, marketContext);

      console.log(`[MARKET JOB] ✓ Created market context for ${user.email}`);
      created++;

    } catch (error) {
      console.error(`[MARKET JOB] Failed to create market context for ${user.email}:`, error);
      failed++;
    }
  }

  return { created, failed, skipped };
}

/**
 * Check if market context already exists for today
 */
async function checkExistingMarketContext(
  notion: Client,
  databaseId: string,
  date: string
): Promise<boolean> {
  try {
    // Get data source ID (API v2025-09-03)
    const db = await notion.databases.retrieve({ database_id: databaseId });
    const dataSourceId = (db as any).data_sources?.[0]?.id;

    if (!dataSourceId) {
      console.warn('[MARKET JOB] No data source found for database');
      return false;
    }

    // Query using data source API
    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      filter: {
        property: 'Date',
        date: {
          equals: date,
        },
      },
      page_size: 1,
    });

    return response.results.length > 0;
  } catch (error) {
    console.warn('[MARKET JOB] Error checking existing context:', error);
    return false; // Assume doesn't exist if check fails
  }
}

/**
 * Create Market Context page in user's Notion database
 */
async function createMarketContextPage(
  notion: Client,
  databaseId: string,
  marketContext: MarketContext
): Promise<string> {
  const response = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      // Title (Date)
      'Name': {
        title: [
          {
            text: {
              content: `Market Context - ${marketContext.date}`,
            },
          },
        ],
      },

      // Market Regime (Select)
      'Market Regime': {
        select: {
          name: marketContext.regime,
        },
      },

      // Risk Assessment (Select)
      'Risk Assessment': {
        select: {
          name: marketContext.riskAssessment,
        },
      },

      // Confidence (Number as percentage)
      'Confidence': {
        number: Math.round(marketContext.regimeConfidence * 100),
      },

      // VIX (Number)
      'VIX': {
        number: parseFloat(marketContext.vix.toFixed(2)),
      },

      // S&P 500 Change 1D (Number as percentage)
      'SPY 1D Change': {
        number: parseFloat(marketContext.spy.change1D.toFixed(2)),
      },

      // S&P 500 Change 1M (Number as percentage)
      'SPY 1M Change': {
        number: parseFloat(marketContext.spy.change1M.toFixed(2)),
      },

      // Market Direction (Select)
      'Market Direction': {
        select: {
          name: marketContext.marketDirection,
        },
      },

      // Top Sectors (Multi-select)
      'Top Sectors': {
        multi_select: marketContext.sectorLeaders.map((sector: any) => ({
          name: sector.name,
        })),
      },

      // Bottom Sectors (Multi-select)
      'Bottom Sectors': {
        multi_select: marketContext.sectorLaggards.map((sector: any) => ({
          name: sector.name,
        })),
      },

      // Summary (Rich Text)
      'Summary': {
        rich_text: [
          {
            text: {
              content: marketContext.summary.substring(0, 2000), // Notion limit
            },
          },
        ],
      },

      // Key Insights (Rich Text - formatted as bullet list)
      'Key Insights': {
        rich_text: [
          {
            text: {
              content: marketContext.keyInsights.join('\n').substring(0, 2000),
            },
          },
        ],
      },

      // Analysis Date (Date)
      'Date': {
        date: {
          start: marketContext.date,
        },
      },
    },
  });

  return response.id;
}

/**
 * Check if today is a NYSE market day
 * (Same logic as scheduled-analyses.ts)
 */
async function checkNYSEMarketDay(): Promise<boolean> {
  const today = new Date();

  // Check if weekend
  const dayOfWeek = today.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    console.log('[MARKET JOB] Weekend detected - market closed');
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
    console.log(`[MARKET JOB] Holiday detected (${dateStr}) - market closed`);
    return false;
  }

  return true;
}
