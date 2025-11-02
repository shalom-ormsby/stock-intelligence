/**
 * Stock Analysis Endpoint
 *
 * Main serverless function that orchestrates the complete stock analysis workflow:
 * 1. Fetch data from FMP (technical + fundamental)
 * 2. Fetch data from FRED (macroeconomic)
 * 3. Calculate scores (composite, technical, fundamental, macro, risk, sentiment)
 * 4. Sync results to Notion Stock Analyses database
 * 5. Query historical analyses and compute deltas
 * 6. Generate AI analysis using LLM (Gemini/Claude/OpenAI)
 * 7. Write analysis to 3 Notion locations:
 *    - Stock Analyses database row
 *    - Child analysis page (dated)
 *    - Stock History database (archived)
 *
 * v1.0.2 - LLM Integration (Gemini Flash 2.5)
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
import { LLMFactory } from '../lib/llm/LLMFactory';
import { AnalysisContext } from '../lib/llm/types';

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
  childAnalysisPageId?: string | null;
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
  llmMetadata?: {
    provider: string;
    model: string;
    tokensUsed: {
      input: number;
      output: number;
      total: number;
    };
    cost: number;
    latencyMs: number;
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

    // LLM Analysis Workflow (v1.0.2)
    console.log('\n📊 Step 4/7: Querying historical analyses...');

    let historicalAnalyses: any[] = [];
    let previousAnalysis: any = null;
    let deltas: any = null;

    try {
      historicalAnalyses = await notionClient.queryHistoricalAnalyses(tickerUpper, 5);
      notionCalls += 1;

      if (historicalAnalyses.length > 0) {
        previousAnalysis = historicalAnalyses[0];

        // Compute composite score deltas
        const scoreChange = scores.composite - previousAnalysis.compositeScore;
        let trendDirection: 'improving' | 'declining' | 'stable' = 'stable';

        if (scoreChange > 0.2) trendDirection = 'improving';
        else if (scoreChange < -0.2) trendDirection = 'declining';

        // Compute category score deltas (Priority 1)
        const categoryDeltas = {
          technical: scores.technical - (previousAnalysis.technicalScore || 0),
          fundamental: scores.fundamental - (previousAnalysis.fundamentalScore || 0),
          macro: scores.macro - (previousAnalysis.macroScore || 0),
          risk: scores.risk - (previousAnalysis.riskScore || 0),
          sentiment: scores.sentiment - (previousAnalysis.sentimentScore || 0),
        };

        // Compute price & volume deltas (Priority 2)
        const previousPrice = previousAnalysis.price || fmpData.quote.previousClose;
        const previousVolume = previousAnalysis.volume || fmpData.quote.avgVolume;

        const priceChangePercent = ((fmpData.quote.price - previousPrice) / previousPrice) * 100;
        const volumeChangePercent = ((fmpData.quote.volume - previousVolume) / previousVolume) * 100;

        // Calculate days elapsed
        const previousDate = new Date(previousAnalysis.date);
        const currentDate = new Date();
        const daysElapsed = Math.ceil((currentDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24));

        // Calculate annualized return (if significant time has passed)
        let annualizedReturn: number | undefined;
        if (daysElapsed > 0) {
          const dailyReturn = priceChangePercent / daysElapsed;
          annualizedReturn = dailyReturn * 365;
        }

        const priceDeltas = {
          priceChangePercent,
          volumeChangePercent,
          daysElapsed,
          annualizedReturn,
        };

        deltas = {
          scoreChange,
          recommendationChange: `${previousAnalysis.recommendation} → ${scores.recommendation}`,
          trendDirection,
          categoryDeltas,
          priceDeltas,
        };

        console.log(`✅ Found ${historicalAnalyses.length} historical analyses`);
        console.log(`   Previous: ${previousAnalysis.compositeScore}/5.0 (${previousAnalysis.date})`);
        console.log(`   Score Change: ${scoreChange > 0 ? '+' : ''}${scoreChange.toFixed(2)} (${trendDirection})`);
        console.log(`   Price Change: ${priceChangePercent > 0 ? '+' : ''}${priceChangePercent.toFixed(2)}% over ${daysElapsed} days`);
        console.log(`   Category Deltas: Tech ${categoryDeltas.technical > 0 ? '+' : ''}${categoryDeltas.technical.toFixed(2)} | Fund ${categoryDeltas.fundamental > 0 ? '+' : ''}${categoryDeltas.fundamental.toFixed(2)} | Macro ${categoryDeltas.macro > 0 ? '+' : ''}${categoryDeltas.macro.toFixed(2)}`);
      } else {
        console.log('ℹ️  No historical analyses found (first analysis for this ticker)');
      }
    } catch (error) {
      console.warn('⚠️  Failed to query historical analyses:', error);
      // Continue without historical context
    }

    console.log('\n📊 Step 5/7: Generating LLM analysis...');

    // Build AnalysisContext for LLM
    const analysisContext: AnalysisContext = {
      ticker: tickerUpper,
      currentMetrics: {
        compositeScore: scores.composite,
        technicalScore: scores.technical,
        fundamentalScore: scores.fundamental,
        macroScore: scores.macro,
        riskScore: scores.risk,
        sentimentScore: scores.sentiment,
        sectorScore: 0, // TODO: Add sector scoring in future
        recommendation: scores.recommendation,
        pattern: 'Unknown', // TODO: Add pattern detection in future
        confidence: qualityReport.dataCompleteness * 5, // Convert 0-1 to 0-5 scale
        dataQualityGrade: qualityReport.grade,
      },
      previousAnalysis: previousAnalysis ? {
        date: previousAnalysis.date,
        compositeScore: previousAnalysis.compositeScore,
        recommendation: previousAnalysis.recommendation,
        metrics: {
          technicalScore: previousAnalysis.technicalScore,
          fundamentalScore: previousAnalysis.fundamentalScore,
          macroScore: previousAnalysis.macroScore,
        },
      } : undefined,
      historicalAnalyses: historicalAnalyses.map(h => ({
        date: h.date,
        compositeScore: h.compositeScore,
        recommendation: h.recommendation,
      })),
      deltas,
    };

    // Generate analysis using LLM
    let llmResult: any;
    let childAnalysisPageId: string | null = null;

    try {
      const llmProvider = LLMFactory.getProviderFromEnv();
      llmResult = await llmProvider.generateAnalysis(analysisContext);

      console.log('✅ LLM analysis generated');
      console.log(`   Provider: ${llmResult.modelUsed}`);
      console.log(`   Tokens: ${llmResult.tokensUsed.input} input + ${llmResult.tokensUsed.output} output = ${llmResult.tokensUsed.input + llmResult.tokensUsed.output} total`);
      console.log(`   Cost: $${llmResult.cost.toFixed(4)}`);
      console.log(`   Latency: ${llmResult.latencyMs}ms`);
    } catch (error) {
      console.error('❌ LLM analysis generation failed:', error);
      throw new Error(`LLM analysis generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    console.log('\n📊 Step 6/7: Writing analysis to Notion...');

    try {
      // 1. Write to Stock Analyses page (main database row)
      await notionClient.writeAnalysisContent(analysesPageId, llmResult.content);
      notionCalls += 1;
      console.log(`✅ Written to Stock Analyses page: ${analysesPageId}`);

      // 2. Create child analysis page with dated title
      const analysisDate = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      childAnalysisPageId = await notionClient.createChildAnalysisPage(
        analysesPageId,
        tickerUpper,
        analysisDate,
        llmResult.content,
        {
          // Additional properties for child page (if needed)
        }
      );
      notionCalls += 2; // create page + write content
      console.log(`✅ Created child analysis page: ${childAnalysisPageId}`);
    } catch (error) {
      console.error('❌ Failed to write analysis to Notion:', error);
      throw new Error(`Failed to write analysis to Notion: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    console.log('\n📊 Step 7/7: Archiving to Stock History...');

    let archived = false;
    let archivedPageId: string | null = null;

    try {
      // Archive to Stock History database with LLM content
      archivedPageId = await notionClient.archiveToHistory(analysesPageId);
      archived = !!archivedPageId;
      notionCalls += 3; // read + create + update

      if (archived && archivedPageId) {
        // Write LLM content to history page (APPEND mode to preserve full history)
        await notionClient.writeAnalysisContent(archivedPageId, llmResult.content, 'append');
        notionCalls += 1;
        console.log(`✅ Archived to Stock History: ${archivedPageId}`);
      } else {
        console.log('⚠️  Archive to Stock History failed');
      }
    } catch (error) {
      console.warn('⚠️  Failed to archive to Stock History:', error);
      // Don't fail the entire request just because archiving failed
    }

    const workflowStatus = archived ? 'Completed' : 'Analysis Generated (Archive Failed)';

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
      historyPageId: archivedPageId,
      childAnalysisPageId,
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
      llmMetadata: llmResult ? {
        provider: llmResult.modelUsed.includes('gemini') ? 'Google Gemini' :
                  llmResult.modelUsed.includes('claude') ? 'Anthropic Claude' :
                  llmResult.modelUsed.includes('gpt') ? 'OpenAI' : 'Unknown',
        model: llmResult.modelUsed,
        tokensUsed: {
          input: llmResult.tokensUsed.input,
          output: llmResult.tokensUsed.output,
          total: llmResult.tokensUsed.input + llmResult.tokensUsed.output,
        },
        cost: llmResult.cost,
        latencyMs: llmResult.latencyMs,
      } : undefined,
      workflow: {
        pollingCompleted: false, // Deprecated in v1.0.2
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
