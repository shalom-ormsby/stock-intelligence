/**
 * Market Context Job Endpoint (v1.1.0)
 *
 * Runs daily at 5:00 AM PT (13:00 UTC) via Vercel Cron
 * Creates a new Market Context page in Notion with today's market analysis
 *
 * Workflow:
 * 1. Verify cron secret (authentication)
 * 2. Check if today is a NYSE market day (skip weekends/holidays)
 * 3. Fetch market context from FMP + FRED APIs
 * 4. Create new page in Market Context database
 * 5. Return execution summary
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from '@notionhq/client';
import { getMarketContext } from '../../lib/market';
import { createFMPClient } from '../../lib/fmp-client';
import { createFREDClient } from '../../lib/fred-client';

// Vercel function configuration
export const maxDuration = 60; // 1 minute (market context fetch is fast)

// Environment variables
const CRON_SECRET = process.env.CRON_SECRET || '';
const NOTION_API_KEY = process.env.NOTION_API_KEY || '';
const MARKET_CONTEXT_DB_ID = process.env.MARKET_CONTEXT_DB_ID || '';
const FMP_API_KEY = process.env.FMP_API_KEY || '';
const FRED_API_KEY = process.env.FRED_API_KEY || '';

/**
 * Main cron handler
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  console.log('[MARKET JOB] Market context job started');

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
    if (!NOTION_API_KEY || !MARKET_CONTEXT_DB_ID || !FMP_API_KEY || !FRED_API_KEY) {
      console.error('[MARKET JOB] Missing required environment variables');
      res.status(500).json({
        success: false,
        error: 'Configuration error',
        message: 'Missing required environment variables',
        missing: {
          NOTION_API_KEY: !NOTION_API_KEY,
          MARKET_CONTEXT_DB_ID: !MARKET_CONTEXT_DB_ID,
          FMP_API_KEY: !FMP_API_KEY,
          FRED_API_KEY: !FRED_API_KEY,
        }
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
        created: false,
      });
      return;
    }

    console.log('[MARKET JOB] ✓ Market is open today');

    // 4. Fetch market context
    const fmpClient = createFMPClient(FMP_API_KEY);
    const fredClient = createFREDClient(FRED_API_KEY);

    console.log('[MARKET JOB] Fetching market context...');
    const marketContext = await getMarketContext(fmpClient, fredClient, true); // Force refresh

    console.log(`[MARKET JOB] ✓ Market context fetched: ${marketContext.regime} regime`);

    // 5. Create Notion page
    const notion = new Client({ auth: NOTION_API_KEY });

    console.log('[MARKET JOB] Creating Notion page...');
    const pageId = await createMarketContextPage(notion, marketContext);

    console.log(`[MARKET JOB] ✓ Notion page created: ${pageId}`);

    // 6. Return success summary
    const summary = {
      success: true,
      marketDay: true,
      created: true,
      pageId,
      context: {
        date: marketContext.date,
        regime: marketContext.regime,
        confidence: Math.round(marketContext.regimeConfidence * 100),
        riskAssessment: marketContext.riskAssessment,
        vix: marketContext.vix.toFixed(1),
        spyChange1D: marketContext.spy.change1D.toFixed(2),
      }
    };

    console.log('[MARKET JOB] ✓ Market context job complete:', JSON.stringify(summary, null, 2));
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
 * Create Market Context page in Notion
 */
async function createMarketContextPage(
  notion: Client,
  marketContext: any
): Promise<string> {
  const response = await notion.pages.create({
    parent: { database_id: MARKET_CONTEXT_DB_ID },
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
