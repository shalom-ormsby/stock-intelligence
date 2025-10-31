/**
 * Stock Analysis Endpoint
 *
 * Main serverless function that orchestrates the complete stock analysis workflow:
 * 1. Fetch data from FMP (technical + fundamental)
 * 2. Fetch data from FRED (macroeconomic)
 * 3. Calculate scores (composite, technical, fundamental, macro, risk, sentiment)
 * 4. Sync results to Notion Stock Analyses database
 * 5. Poll for user to complete AI analysis
 * 6. Archive to Stock History when ready
 *
 * v1.0 - Vercel Serverless + TypeScript
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { createFMPClient } from '../lib/fmp-client';
import { createFREDClient } from '../lib/fred-client';
import { createStockScorer } from '../lib/scoring';
import { createNotionClient, AnalysisData } from '../lib/notion-client';
import { requireAuth } from '../lib/auth';
import { validateStockData, validateTicker } from '../lib/validators';
import { createTimer, logAnalysisStart, logAnalysisComplete, logAnalysisFailed } from '../lib/logger';
import { formatErrorResponse, formatErrorForNotion } from '../lib/utils';
import { getErrorCode, getStatusCode, RateLimitError } from '../lib/errors';
import { RateLimiter, extractUserId, getSecondsUntilMidnightUTC } from '../lib/rate-limiter';

interface AnalyzeRequest {
  ticker: string;
  userId?: string; // User ID for rate limiting (required for rate limiting)
  usePollingWorkflow?: boolean; // Default: true (v0.3.0 workflow)
  timeout?: number; // Polling timeout in seconds (default: 600 = 10 minutes)
  pollInterval?: number; // Poll interval in seconds (default: 10)
  skipPolling?: boolean; // Skip polling entirely (default: false)
}

interface AnalyzeResponse {
  success: boolean;
  ticker: string;
  analysesPageId: string | null;
  historyPageId: string | null;
  scores?: {
    composite: number;
    technical: number;
    fundamental: number;
    macro: number;
    risk: number;
    sentiment: number;
    recommendation: string;
  };
  dataQuality?: {
    completeness: number;
    grade: string;
    confidence: string;
  };
  performance?: {
    duration: number;
    fmpCalls: number;
    fredCalls: number;
    notionCalls: number;
  };
  workflow?: {
    pollingCompleted: boolean;
    archived: boolean;
    status: string;
  };
  rateLimit?: {
    remaining: number;
    total: number;
    resetAt: string;
    bypassed?: boolean;
  };
  error?: string;
  details?: string;
}

/**
 * Main analysis handler
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
      details: 'Only POST requests are accepted',
    });
    return;
  }

  // Check authentication (optional - only if API_KEY env var is set)
  if (!requireAuth(req, res)) {
    return;
  }

  const timer = createTimer('Stock Analysis');
  let ticker: string | undefined;
  let analysesPageId: string | null = null;
  let rateLimitResult: any = null;

  try {
    // Parse request body
    const body: AnalyzeRequest =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const {
      ticker: rawTicker,
      userId,
      usePollingWorkflow = true,
      timeout = 600,
      pollInterval = 10,
      skipPolling = false,
    } = body;

    // Extract user ID for rate limiting
    const extractedUserId = userId || extractUserId(req);

    if (!extractedUserId) {
      res.status(400).json({
        success: false,
        error: 'User ID required',
        details: 'User ID is required for rate limiting. Include userId in request body or X-User-ID header.',
      });
      return;
    }

    // Check rate limit BEFORE processing analysis
    const rateLimiter = new RateLimiter();
    rateLimitResult = await rateLimiter.checkAndIncrement(extractedUserId);

    if (!rateLimitResult.allowed) {
      throw new RateLimitError(rateLimitResult.resetAt);
    }

    // Validate ticker with custom validator
    if (!rawTicker || typeof rawTicker !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Invalid ticker',
        details: 'Ticker is required and must be a string',
      });
      return;
    }

    ticker = validateTicker(rawTicker); // Throws InvalidTickerError if invalid
    const tickerUpper = ticker.toUpperCase().trim();

    // Log analysis start with structured logging
    logAnalysisStart(tickerUpper, {
      workflow: usePollingWorkflow ? 'v0.3.0 (polling)' : 'v0.2.9 (immediate)',
      timeout,
      pollInterval,
      skipPolling,
    });

    console.log('='.repeat(60));
    console.log(`Starting analysis for ${tickerUpper}`);
    console.log(`Workflow: ${usePollingWorkflow ? 'v0.3.0 (polling)' : 'v0.2.9 (immediate)'}`);
    console.log('='.repeat(60));

    // Initialize API clients
    const fmpApiKey = process.env.FMP_API_KEY;
    const fredApiKey = process.env.FRED_API_KEY;
    const notionApiKey = process.env.NOTION_API_KEY;
    const stockAnalysesDbId = process.env.STOCK_ANALYSES_DB_ID;
    const stockHistoryDbId = process.env.STOCK_HISTORY_DB_ID;
    const notionUserId = process.env.NOTION_USER_ID;

    // Validate environment variables
    if (!fmpApiKey) {
      throw new Error('FMP_API_KEY environment variable is not set');
    }
    if (!fredApiKey) {
      throw new Error('FRED_API_KEY environment variable is not set');
    }
    if (!notionApiKey) {
      throw new Error('NOTION_API_KEY environment variable is not set');
    }
    if (!stockAnalysesDbId) {
      throw new Error('STOCK_ANALYSES_DB_ID environment variable is not set');
    }
    if (!stockHistoryDbId) {
      throw new Error('STOCK_HISTORY_DB_ID environment variable is not set');
    }

    const fmpClient = createFMPClient(fmpApiKey);
    const fredClient = createFREDClient(fredApiKey);
    const scorer = createStockScorer();
    const notionClient = createNotionClient({
      apiKey: notionApiKey,
      stockAnalysesDbId,
      stockHistoryDbId,
      userId: notionUserId,
    });

    // Track API calls
    let fmpCalls = 0;
    let fredCalls = 0;
    let notionCalls = 0;

    console.log('\n📊 Step 1/5: Fetching stock data...');

    // Fetch data in parallel (FMP + FRED)
    const [fmpData, macroData] = await Promise.all([
      (async () => {
        const data = await fmpClient.getAnalysisData(tickerUpper);
        fmpCalls = 11; // getAnalysisData makes 11 calls
        return data;
      })(),
      (async () => {
        const data = await fredClient.getMacroData();
        fredCalls = 6; // getMacroData makes 6 calls
        return data;
      })(),
    ]);

    console.log('✅ Data fetched successfully');
    console.log(
      `   FMP: ${fmpCalls} calls | FRED: ${fredCalls} calls | Total: ${fmpCalls + fredCalls} calls`
    );

    // Extract data for scoring
    const technical = {
      current_price: fmpData.quote.price,
      ma_50: fmpData.technicalIndicators.sma50[0]?.value,
      ma_200: fmpData.technicalIndicators.sma200[0]?.value,
      rsi: fmpData.technicalIndicators.rsi[0]?.value,
      macd: fmpData.technicalIndicators.ema12[0]?.value, // Simplified - real MACD needs calculation
      macd_signal: fmpData.technicalIndicators.ema26[0]?.value,
      volume: fmpData.quote.volume,
      avg_volume_20d: fmpData.quote.avgVolume,
      volatility_30d: undefined, // TODO: Calculate from historical data
      price_change_1d: fmpData.quote.change / fmpData.quote.previousClose,
      price_change_5d: undefined, // TODO: Calculate from historical data
      price_change_1m: undefined, // TODO: Calculate from historical data
      week_52_high: fmpData.quote.yearHigh,
      week_52_low: fmpData.quote.yearLow,
    };

    const fundamental = {
      company_name: fmpData.profile.companyName,
      market_cap: fmpData.profile.marketCap,
      pe_ratio: fmpData.fundamentals.ratios[0]?.priceToEarningsRatio,
      eps: fmpData.fundamentals.incomeStatements[0]?.eps,
      revenue_ttm: fmpData.fundamentals.incomeStatements[0]?.revenue,
      debt_to_equity: fmpData.fundamentals.ratios[0]?.debtToEquity,
      beta: fmpData.profile.beta,
    };

    const macro = {
      fed_funds_rate: macroData.fedFundsRate || undefined,
      unemployment: macroData.unemploymentRate || undefined,
      consumer_sentiment: macroData.consumerSentiment || undefined,
      yield_curve_spread: macroData.yieldCurveSpread || undefined,
      vix: macroData.vix || undefined,
      gdp: macroData.gdp || undefined,
    };

    // Validate data quality before scoring
    const qualityReport = validateStockData({
      technical,
      fundamental,
      macro,
    });

    console.log('\n📊 Data Quality Report:');
    console.log(`   Completeness: ${Math.round(qualityReport.dataCompleteness * 100)}%`);
    console.log(`   Grade: ${qualityReport.grade}`);
    console.log(`   Confidence: ${qualityReport.confidence}`);
    console.log(`   Can Proceed: ${qualityReport.canProceed ? 'Yes' : 'No'}`);
    if (qualityReport.missingFields.length > 0) {
      console.log(`   Missing Fields: ${qualityReport.missingFields.join(', ')}`);
    }

    // Log data quality issues (don't fail, just warn)
    if (!qualityReport.canProceed) {
      console.warn(
        `⚠️  Data quality below minimum threshold (${Math.round(qualityReport.dataCompleteness * 100)}% < 40%)`
      );
      console.warn('   Proceeding with analysis but scores may be unreliable');
    }

    console.log('\n📊 Step 2/5: Calculating scores...');

    // Calculate scores
    const scores = scorer.calculateScores({
      technical,
      fundamental,
      macro,
    });

    console.log('✅ Scores calculated');
    console.log(`   Composite: ${scores.composite} | ${scores.recommendation}`);
    console.log(
      `   Technical: ${scores.technical} | Fundamental: ${scores.fundamental} | Macro: ${scores.macro}`
    );
    console.log(`   Risk: ${scores.risk} | Sentiment: ${scores.sentiment}`);

    console.log('\n📊 Step 3/5: Syncing to Notion...');

    // Prepare analysis data for Notion
    const analysisData: AnalysisData = {
      ticker: tickerUpper,
      companyName: fmpData.profile.companyName,
      timestamp: new Date(),
      technical,
      fundamental,
      macro,
      scores,
      apiCalls: {
        fmp: fmpCalls,
        fred: fredCalls,
        total: fmpCalls + fredCalls,
      },
    };

    // Sync to Notion
    const syncResult = await notionClient.syncToNotion(
      analysisData,
      usePollingWorkflow
    );

    analysesPageId = syncResult.analysesPageId; // Store for error handling
    const historyPageId = syncResult.historyPageId;

    notionCalls += 2; // syncToNotion makes at least 2 calls (find + upsert)

    if (!analysesPageId) {
      throw new Error('Failed to sync to Notion Stock Analyses database');
    }

    console.log('✅ Synced to Notion');
    console.log(`   Stock Analyses page ID: ${analysesPageId}`);
    if (historyPageId) {
      console.log(`   Stock History page ID: ${historyPageId}`);
    }

    // Polling workflow (v0.3.0)
    let pollingCompleted = false;
    let archived = false;
    let workflowStatus = 'Pending Analysis';

    if (usePollingWorkflow && !skipPolling) {
      console.log('\n📊 Step 4/5: Waiting for AI analysis...');

      pollingCompleted = await notionClient.waitForAnalysisCompletion(
        analysesPageId,
        timeout,
        pollInterval,
        skipPolling
      );

      notionCalls += Math.ceil(timeout / pollInterval); // Polling makes ~60 calls for 10 min timeout

      if (pollingCompleted) {
        console.log('\n📊 Step 5/5: Archiving to Stock History...');

        const archivedPageId = await notionClient.archiveToHistory(analysesPageId);
        archived = !!archivedPageId;
        workflowStatus = archived ? 'Logged in History' : 'Archive Failed';

        notionCalls += 3; // archiveToHistory makes 3 calls (read + create + update)

        if (archived) {
          console.log(`✅ Archived to Stock History: ${archivedPageId}`);
        } else {
          console.log('⚠️  Archive to Stock History failed');
        }
      } else {
        workflowStatus = 'Analysis Incomplete';
        console.log('⏱️  Polling timeout - analysis not completed');
      }
    } else if (skipPolling) {
      workflowStatus = 'Polling Skipped';
      console.log('\n⏭️  Polling skipped - archive manually when ready');
    } else {
      // v0.2.9 workflow - immediate history creation
      workflowStatus = historyPageId ? 'Completed' : 'History Creation Failed';
      console.log('\n✅ v0.2.9 workflow complete');
    }

    const duration = timer.end(true);

    // Log successful completion with structured logging
    logAnalysisComplete(tickerUpper, duration, scores.composite, {
      dataCompleteness: qualityReport.dataCompleteness,
      dataQuality: qualityReport.grade,
      workflow: usePollingWorkflow ? 'polling' : 'immediate',
      archived,
    });

    console.log('\n' + '='.repeat(60));
    console.log(`Analysis complete for ${tickerUpper} in ${duration}ms`);
    console.log('='.repeat(60) + '\n');

    // Return success response
    const response: AnalyzeResponse = {
      success: true,
      ticker: tickerUpper,
      analysesPageId,
      historyPageId,
      scores: {
        composite: scores.composite,
        technical: scores.technical,
        fundamental: scores.fundamental,
        macro: scores.macro,
        risk: scores.risk,
        sentiment: scores.sentiment,
        recommendation: scores.recommendation,
      },
      dataQuality: {
        completeness: Math.round(qualityReport.dataCompleteness * 100) / 100,
        grade: qualityReport.grade,
        confidence: qualityReport.confidence,
      },
      performance: {
        duration,
        fmpCalls,
        fredCalls,
        notionCalls,
      },
      workflow: {
        pollingCompleted,
        archived,
        status: workflowStatus,
      },
      rateLimit: rateLimitResult
        ? {
            remaining: rateLimitResult.remaining,
            total: rateLimitResult.total,
            resetAt: rateLimitResult.resetAt.toISOString(),
            bypassed: rateLimitResult.bypassed,
          }
        : undefined,
    };

    // Set rate limit headers
    if (rateLimitResult) {
      res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
      res.setHeader('X-RateLimit-Total', rateLimitResult.total.toString());
      res.setHeader('X-RateLimit-Reset', rateLimitResult.resetAt.toISOString());
    }

    res.status(200).json(response);
  } catch (error) {
    // End timer with error
    const duration = timer.endWithError(error as Error);

    console.error('❌ Analysis failed:', error);

    // Log failure with structured logging
    const errorCode = getErrorCode(error);
    if (ticker) {
      logAnalysisFailed(ticker, errorCode, { duration }, error as Error);
    }

    // Special handling for rate limit errors
    if (error instanceof RateLimitError) {
      const retryAfter = getSecondsUntilMidnightUTC();

      res.setHeader('Retry-After', retryAfter.toString());
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', error.resetAt.toISOString());

      res.status(429).json({
        success: false,
        error: error.userMessage,
        code: error.code,
        resetAt: error.resetAt.toISOString(),
        retryAfter,
      });
      return;
    }

    // Write error to Notion if we have a page ID
    if (analysesPageId && ticker) {
      try {
        const notionClient = createNotionClient({
          apiKey: process.env.NOTION_API_KEY!,
          stockAnalysesDbId: process.env.STOCK_ANALYSES_DB_ID!,
          stockHistoryDbId: process.env.STOCK_HISTORY_DB_ID!,
          userId: process.env.NOTION_USER_ID,
        });

        const errorNote = formatErrorForNotion(error, ticker);
        await notionClient.writeErrorToPage(analysesPageId, errorNote);
      } catch (notionError) {
        console.error('❌ Failed to write error to Notion:', notionError);
        // Don't fail the request just because we couldn't write to Notion
      }
    }

    // Format error response with proper status code
    const errorResponse = formatErrorResponse(error, ticker);
    const statusCode = getStatusCode(error);

    res.status(statusCode).json(errorResponse);
  }
}
