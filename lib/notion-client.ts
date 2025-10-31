/**
 * Notion Client for Stock Intelligence v1.0
 *
 * Handles all Notion API operations:
 * - Writing analysis metrics to Stock Analyses database
 * - Polling for "Send to History" button click
 * - Archiving completed analyses to Stock History
 *
 * Ported from Python v0.3.0 NotionClient class
 */

import { Client } from '@notionhq/client';
import {
  PageObjectResponse,
} from '@notionhq/client/build/src/api-endpoints';
import { ScoreResults } from './scoring';

interface NotionConfig {
  apiKey: string;
  stockAnalysesDbId: string;
  stockHistoryDbId: string;
  userId?: string; // For notifications
}

interface AnalysisData {
  ticker: string;
  companyName?: string;
  timestamp: Date;
  technical: TechnicalData;
  fundamental: FundamentalData;
  macro: MacroData;
  scores: ScoreResults;
  pattern?: PatternData;
  apiCalls?: {
    fmp?: number;
    fred?: number;
    total?: number;
  };
}

interface TechnicalData {
  current_price?: number;
  ma_50?: number;
  ma_200?: number;
  rsi?: number;
  macd?: number;
  macd_signal?: number;
  volume?: number;
  avg_volume_20d?: number;
  volatility_30d?: number;
  price_change_1d?: number;
  price_change_5d?: number;
  price_change_1m?: number;
  week_52_high?: number;
  week_52_low?: number;
}

interface FundamentalData {
  company_name?: string;
  market_cap?: number;
  pe_ratio?: number;
  eps?: number;
  revenue_ttm?: number;
  debt_to_equity?: number;
  beta?: number;
}

interface MacroData {
  fed_funds_rate?: number;
  unemployment?: number;
  consumer_sentiment?: number;
  yield_curve_spread?: number;
  vix?: number;
  gdp?: number;
}

interface PatternData {
  score?: number;
  signal?: string;
  detected?: string[];
}

type ContentStatus =
  | 'Pending Analysis'
  | 'Send to History'
  | 'Logged in History'
  | 'Analysis Incomplete'
  | 'New'
  | 'Updated';

export class NotionClient {
  private client: Client;
  private stockAnalysesDbId: string;
  private stockHistoryDbId: string;
  private userId?: string;

  constructor(config: NotionConfig) {
    this.client = new Client({ auth: config.apiKey });
    this.stockAnalysesDbId = config.stockAnalysesDbId;
    this.stockHistoryDbId = config.stockHistoryDbId;
    this.userId = config.userId;
  }

  /**
   * Sync analysis data to Notion Stock Analyses database
   *
   * @param data - Analysis data containing ticker, scores, technical/fundamental metrics
   * @param usePollingWorkflow - If true, sets Content Status to "Pending Analysis" and waits for AI completion.
   *                             If false, sets to "New"/"Updated" and creates history immediately.
   * @returns Object containing page IDs for Stock Analyses and Stock History (if created)
   *
   * @example
   * ```typescript
   * const result = await notionClient.syncToNotion(analysisData, true);
   * console.log('Created page:', result.analysesPageId);
   * ```
   */
  async syncToNotion(
    data: AnalysisData,
    usePollingWorkflow: boolean = true
  ): Promise<{ analysesPageId: string | null; historyPageId: string | null }> {
    console.log('='.repeat(60));
    console.log(`Syncing ${data.ticker} to Notion...`);
    console.log('='.repeat(60));

    // Build properties for Stock Analyses
    const properties = this.buildProperties(data, 'analyses');

    // Upsert to Stock Analyses
    const analysesPageId = await this.upsertAnalyses(
      data.ticker,
      properties,
      usePollingWorkflow
    );

    console.log(
      `✅ Stock Analyses: ${analysesPageId ? 'Updated' : 'Created'}`
    );

    // v0.3.0 workflow: Skip history creation (handled by archive_to_history)
    // v0.2.9 workflow: Create history immediately
    let historyPageId = null;
    if (!usePollingWorkflow && analysesPageId) {
      const historyProperties = this.buildProperties(data, 'history');
      historyPageId = await this.createHistory(
        data.ticker,
        data.timestamp,
        historyProperties
      );
      console.log('✅ Stock History: Created new entry');
    } else {
      console.log(
        '⏭️  Stock History: Deferred until AI analysis complete (v0.3.0 workflow)'
      );
    }

    console.log('='.repeat(60) + '\n');

    return { analysesPageId, historyPageId };
  }

  /**
   * Upsert page in Stock Analyses database
   * Updates existing page if ticker exists, creates new page otherwise
   */
  private async upsertAnalyses(
    ticker: string,
    properties: Record<string, any>,
    usePollingWorkflow: boolean
  ): Promise<string | null> {
    try {
      // Find existing page by ticker
      const existingPageId = await this.findPageByTicker(
        this.stockAnalysesDbId,
        ticker,
        'title'
      );

      // Set Content Status based on workflow
      if (usePollingWorkflow) {
        // v0.3.0 workflow: Set to "Pending Analysis"
        properties['Content Status'] = {
          select: { name: 'Pending Analysis' },
        };
        console.log(
          '[Notion] Setting Content Status: Pending Analysis (v0.3.0 polling workflow)'
        );
      } else {
        // v0.2.9 workflow: Set to "Updated" or "New"
        properties['Content Status'] = {
          select: { name: existingPageId ? 'Updated' : 'New' },
        };
        console.log(
          `[Notion] Setting Content Status: ${
            existingPageId ? 'Updated' : 'New'
          } (v0.2.9 legacy workflow)`
        );
      }

      if (existingPageId) {
        // Update existing page
        const response = await this.client.pages.update({
          page_id: existingPageId,
          properties,
        });
        return response.id;
      } else {
        // Create new page
        const response = await this.client.pages.create({
          parent: { database_id: this.stockAnalysesDbId },
          properties,
        });
        return response.id;
      }
    } catch (error) {
      console.error('[Notion] Analyses upsert error:', error);
      return null;
    }
  }

  /**
   * Create new entry in Stock History database
   */
  private async createHistory(
    ticker: string,
    timestamp: Date,
    properties: Record<string, any>
  ): Promise<string | null> {
    try {
      const formattedDate = timestamp.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      // Override Name property for history
      properties['Name'] = {
        title: [{ text: { content: `${ticker} - ${formattedDate}` } }],
      };

      // Always set Content Status to "New" for history
      properties['Content Status'] = { select: { name: 'New' } };
      console.log('[Notion] Setting Content Status: New (history record)');

      const response = await this.client.pages.create({
        parent: { database_id: this.stockHistoryDbId },
        properties,
      });

      return response.id;
    } catch (error) {
      console.error('[Notion] History create error:', error);
      return null;
    }
  }

  /**
   * Find page by ticker in database
   * Returns page ID if found, null otherwise
   */
  private async findPageByTicker(
    databaseId: string,
    ticker: string,
    propertyType: 'title' | 'rich_text'
  ): Promise<string | null> {
    try {
      const response = await this.client.databases.query({
        database_id: databaseId,
        filter: {
          property: 'Ticker',
          [propertyType]: {
            equals: ticker,
          },
        } as any,
        page_size: 1,
      });

      if (response.results.length > 0) {
        return response.results[0].id;
      }

      return null;
    } catch (error) {
      console.error('[Notion] Find by ticker error:', error);
      return null;
    }
  }

  /**
   * Build Notion properties from analysis data
   * Matches v0.3.0 Python property structure exactly
   */
  private buildProperties(
    data: AnalysisData,
    dbType: 'analyses' | 'history'
  ): Record<string, any> {
    const { ticker, companyName, timestamp, technical, fundamental, scores } =
      data;

    // Calculate data completeness (28 total fields from v0.3.0)
    const fields = [
      technical.current_price,
      technical.ma_50,
      technical.ma_200,
      technical.rsi,
      technical.macd,
      technical.macd_signal,
      technical.volume,
      technical.avg_volume_20d,
      technical.volatility_30d,
      technical.price_change_1d,
      technical.price_change_5d,
      technical.price_change_1m,
      fundamental.market_cap,
      fundamental.pe_ratio,
      fundamental.eps,
      fundamental.revenue_ttm,
      fundamental.debt_to_equity,
      fundamental.beta,
      technical.week_52_high,
      technical.week_52_low,
    ];

    const available = fields.filter((f) => f !== undefined && f !== null).length;
    const totalFields = 28; // From v0.3.0
    const completeness = available / totalFields;

    // Data quality grade
    let grade: string;
    if (completeness >= 0.9) grade = 'A - Excellent';
    else if (completeness >= 0.75) grade = 'B - Good';
    else if (completeness >= 0.6) grade = 'C - Fair';
    else grade = 'D - Poor';

    // Confidence level
    let confidence: string;
    if (completeness >= 0.85) confidence = 'High';
    else if (completeness >= 0.7) confidence = 'Medium-High';
    else if (completeness >= 0.55) confidence = 'Medium';
    else confidence = 'Low';

    // Build properties object
    const props: Record<string, any> = {};

    // Ticker property (title for analyses, rich_text for history)
    if (dbType === 'analyses') {
      props['Ticker'] = { title: [{ text: { content: ticker } }] };
    } else {
      props['Ticker'] = { rich_text: [{ text: { content: ticker } }] };
    }

    // Company name
    if (companyName) {
      props['Company Name'] = {
        rich_text: [{ text: { content: companyName } }],
      };
    }

    // Analysis date
    props['Analysis Date'] = { date: { start: timestamp.toISOString() } };

    // Owner (for notifications)
    if (this.userId) {
      props['Owner'] = { people: [{ id: this.userId }] };
    }

    // Current price
    if (technical.current_price !== undefined) {
      props['Current Price'] = { number: technical.current_price };
    }

    // Scores
    props['Composite Score'] = { number: scores.composite };
    props['Technical Score'] = { number: scores.technical };
    props['Fundamental Score'] = { number: scores.fundamental };
    props['Macro Score'] = { number: scores.macro };
    props['Risk Score'] = { number: scores.risk };
    props['Sentiment Score'] = { number: scores.sentiment };

    // Recommendation and quality
    props['Recommendation'] = { select: { name: scores.recommendation } };
    props['Confidence'] = { select: { name: confidence } };
    props['Data Quality Grade'] = { select: { name: grade } };
    props['Data Completeness'] = {
      number: Math.round(completeness * 100) / 100,
    };

    // Protocol version
    props['Protocol Version'] = {
      rich_text: [{ text: { content: 'v1.0.0' } }],
    };

    // Technical indicators
    if (technical.ma_50 !== undefined)
      props['50 Day MA'] = { number: Math.round(technical.ma_50 * 100) / 100 };
    if (technical.ma_200 !== undefined)
      props['200 Day MA'] = {
        number: Math.round(technical.ma_200 * 100) / 100,
      };
    if (technical.rsi !== undefined)
      props['RSI'] = { number: Math.round(technical.rsi * 10) / 10 };
    if (technical.macd !== undefined)
      props['MACD'] = { number: Math.round(technical.macd * 100) / 100 };
    if (technical.macd_signal !== undefined)
      props['MACD Signal'] = {
        number: Math.round(technical.macd_signal * 100) / 100,
      };
    if (technical.volume !== undefined)
      props['Volume'] = { number: Math.floor(technical.volume) };
    if (technical.avg_volume_20d !== undefined)
      props['Avg Volume (20D)'] = {
        number: Math.round(technical.avg_volume_20d * 10) / 10,
      };
    if (technical.volatility_30d !== undefined)
      props['Volatility (30D)'] = {
        number: Math.round(technical.volatility_30d * 10000) / 10000,
      };
    if (technical.price_change_1d !== undefined)
      props['Price Change (1D)'] = {
        number: Math.round(technical.price_change_1d * 10000) / 10000,
      };
    if (technical.price_change_5d !== undefined)
      props['Price Change (5D)'] = {
        number: Math.round(technical.price_change_5d * 10000) / 10000,
      };
    if (technical.price_change_1m !== undefined)
      props['Price Change (1M)'] = {
        number: Math.round(technical.price_change_1m * 10000) / 10000,
      };

    // Volume change calculation
    if (
      technical.volume !== undefined &&
      technical.avg_volume_20d !== undefined &&
      technical.avg_volume_20d !== 0
    ) {
      const volumeChange =
        (technical.volume - technical.avg_volume_20d) / technical.avg_volume_20d;
      props['Volume Change'] = {
        number: Math.round(volumeChange * 10000) / 10000,
      };
    }

    // Fundamental data
    if (fundamental.market_cap !== undefined)
      props['Market Cap'] = {
        number: Math.round(fundamental.market_cap * 100) / 100,
      };
    if (fundamental.pe_ratio !== undefined)
      props['P/E Ratio'] = {
        number: Math.round(fundamental.pe_ratio * 100) / 100,
      };
    if (fundamental.eps !== undefined)
      props['EPS'] = { number: Math.round(fundamental.eps * 100) / 100 };
    if (fundamental.revenue_ttm !== undefined)
      props['Revenue (TTM)'] = { number: Math.round(fundamental.revenue_ttm) };
    if (fundamental.debt_to_equity !== undefined)
      props['Debt to Equity'] = {
        number: Math.round(fundamental.debt_to_equity * 100) / 100,
      };
    if (fundamental.beta !== undefined)
      props['Beta'] = { number: Math.round(fundamental.beta * 100) / 100 };
    if (technical.week_52_high !== undefined)
      props['52 Week High'] = {
        number: Math.round(technical.week_52_high * 100) / 100,
      };
    if (technical.week_52_low !== undefined)
      props['52 Week Low'] = {
        number: Math.round(technical.week_52_low * 100) / 100,
      };

    // API calls tracking
    const totalApiCalls =
      (data.apiCalls?.fmp || 0) +
      (data.apiCalls?.fred || 0);
    props['API Calls Used'] = { number: totalApiCalls };

    // Pattern data (if available)
    if (data.pattern) {
      if (data.pattern.score !== undefined) {
        props['Pattern Score'] = { number: data.pattern.score };
      }
      if (data.pattern.signal) {
        const allowedSignals = [
          '🚀 Extremely Bullish',
          '📈 Bullish',
          '✋ Neutral',
          '📉 Bearish',
          '🚨 Extremely Bearish',
        ];
        if (allowedSignals.includes(data.pattern.signal)) {
          props['Pattern Signal'] = { select: { name: data.pattern.signal } };
        }
      }
      if (data.pattern.detected && data.pattern.detected.length > 0) {
        props['Detected Patterns'] = {
          rich_text: [{ text: { content: data.pattern.detected.join(', ') } }],
        };
      }
    }

    return props;
  }

  /**
   * Poll Stock Analyses page until user clicks "Send to History" button
   *
   * Continuously checks a Stock Analyses page for Content Status changes.
   * Returns when status becomes "Send to History" (indicating AI analysis is complete)
   * or when timeout is reached.
   *
   * @param pageId - Notion page ID to poll
   * @param timeout - Maximum time to wait in seconds (default: 600 = 10 minutes)
   * @param pollInterval - How often to check status in seconds (default: 10)
   * @param skipPolling - If true, skip polling and return immediately (default: false)
   * @returns True if "Send to History" status detected, false if timeout or skipped
   *
   * @example
   * ```typescript
   * const completed = await notionClient.waitForAnalysisCompletion(pageId, 600, 10);
   * if (completed) {
   *   await notionClient.archiveToHistory(pageId);
   * }
   * ```
   *
   * @remarks
   * - Part of v0.3.0 polling workflow
   * - Sets Content Status to "Analysis Incomplete" on timeout
   * - Designed for use after writing metrics but before AI analysis completes
   */
  async waitForAnalysisCompletion(
    pageId: string,
    timeout: number = 600, // 10 minutes default
    pollInterval: number = 10, // 10 seconds default
    skipPolling: boolean = false
  ): Promise<boolean> {
    if (skipPolling) {
      console.log('⏭️  Polling skipped. Run archive manually when ready:');
      console.log(`    await notion.archiveToHistory('${pageId}')`);
      return false;
    }

    const startTime = Date.now();
    const endTime = startTime + timeout * 1000;

    console.log('✅ Metrics synced. Waiting for AI analysis to complete...');
    console.log('📊 Open Notion and run your AI prompt now.');
    console.log(
      `⏱️  Polling every ${pollInterval}s for up to ${timeout / 60} minutes...`
    );

    while (Date.now() < endTime) {
      try {
        // Query page for current Content Status
        const page = (await this.client.pages.retrieve({
          page_id: pageId,
        })) as PageObjectResponse;

        const contentStatusProperty = page.properties['Content Status'];
        if (contentStatusProperty?.type === 'select') {
          const status = contentStatusProperty.select?.name as
            | ContentStatus
            | undefined;

          if (status === 'Send to History') {
            console.log('✅ AI analysis complete! Starting archival...');
            return true;
          }

          // Calculate time remaining
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const remaining = timeout - elapsed;

          console.log(
            `⏳ Status: ${status || 'None'} | Checking again in ${pollInterval}s (${remaining}s remaining)`
          );
        }
      } catch (error) {
        console.error('⚠️  Exception during polling:', error);
      }

      // Wait for poll interval
      await new Promise((resolve) => setTimeout(resolve, pollInterval * 1000));
    }

    // Timeout reached - set status to "Analysis Incomplete"
    console.log('⏱️  Timeout reached. Analysis not completed within time limit.');
    console.log('🔄 Setting Content Status to "Analysis Incomplete"...');

    try {
      await this.client.pages.update({
        page_id: pageId,
        properties: {
          'Content Status': { select: { name: 'Analysis Incomplete' } },
        },
      });
      console.log('✅ Status updated to "Analysis Incomplete"');
    } catch (error) {
      console.error('⚠️  Could not update status:', error);
    }

    console.log('💡 You can run the archiving function manually when ready:');
    console.log(`    await notion.archiveToHistory('${pageId}')`);
    return false;
  }

  /**
   * Archive completed analysis to Stock History database
   *
   * Copies all properties and content blocks from a Stock Analyses page to create
   * a new historical record in Stock History. This is typically called after AI
   * analysis is complete and the user has clicked "Send to History".
   *
   * @param pageId - Notion page ID of the Stock Analyses page to archive
   * @returns Page ID of the newly created Stock History entry, or null if failed
   *
   * @example
   * ```typescript
   * const historyId = await notionClient.archiveToHistory(analysesPageId);
   * if (historyId) {
   *   console.log('Archived to history:', historyId);
   * }
   * ```
   *
   * @remarks
   * - Creates a new page in Stock History (append-only, never updates)
   * - Excludes Stock Analyses-specific properties (Owner, Send to History, etc.)
   * - Sets Content Status to "Historical"
   * - Updates original page Content Status to "Logged in History"
   * - Copies all content blocks (except synced blocks)
   */
  async archiveToHistory(pageId: string): Promise<string | null> {
    console.log('📦 Archiving analysis to Stock History...');

    try {
      // Read full page data
      const page = (await this.client.pages.retrieve({
        page_id: pageId,
      })) as PageObjectResponse;

      const blocks = await this.client.blocks.children.list({
        block_id: pageId,
      });

      // Properties to exclude from copy
      const EXCLUDE_PROPERTIES = new Set([
        'Content Status', // Workflow-specific
        'Owner', // Workflow-specific
        'Send to History', // Button property
        'Next Review Date', // Stock Analyses-specific
        'AI summary', // Stock Analyses-specific
        'Holding Type', // Stock Analyses-specific
      ]);

      // Copy properties (excluding Stock Analyses-specific ones)
      const propertiesToCopy: Record<string, any> = {};
      let excludedCount = 0;

      for (const [propName, propValue] of Object.entries(page.properties)) {
        if (EXCLUDE_PROPERTIES.has(propName)) {
          excludedCount++;
          continue;
        }

        const cleanedValue = this.cleanPropertyValue(propValue);
        if (cleanedValue) {
          propertiesToCopy[propName] = cleanedValue;
        }
      }

      console.log(
        `ℹ️  Copying ${Object.keys(propertiesToCopy).length} properties, excluding ${excludedCount} Stock Analyses-specific properties`
      );

      // Get ticker and analysis date for History page title
      const tickerProp = page.properties['Ticker'];
      const dateProp = page.properties['Analysis Date'];

      if (tickerProp?.type !== 'title' || dateProp?.type !== 'date') {
        console.error('⚠️  Missing required properties (Ticker or Analysis Date)');
        return null;
      }

      const ticker = tickerProp.title[0]?.plain_text || 'Unknown';
      const analysisDate = new Date(dateProp.date?.start || Date.now());

      const formattedDate = analysisDate.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      // Set Stock History specific properties
      propertiesToCopy['Ticker'] = {
        rich_text: [{ text: { content: ticker } }],
      };
      propertiesToCopy['Name'] = {
        title: [{ text: { content: `${ticker} - ${formattedDate}` } }],
      };
      propertiesToCopy['Content Status'] = { select: { name: 'Historical' } };

      // Create Stock History page
      const historyPage = await this.client.pages.create({
        parent: { database_id: this.stockHistoryDbId },
        properties: propertiesToCopy,
      });

      console.log(`✅ Created Stock History page: ${ticker} - ${formattedDate}`);

      // Copy content blocks (excluding synced blocks)
      const blocksToCopy = blocks.results.filter(
        (block: any) => block.type !== 'synced_block'
      );

      if (blocksToCopy.length > 0) {
        // Note: Block copying requires careful handling of block structure
        // For now, we'll log this as a TODO - full implementation requires
        // recursive block copying with proper type handling
        console.log(
          `ℹ️  ${blocksToCopy.length} content blocks found (block copying to be implemented)`
        );
      } else {
        console.log('ℹ️  No content blocks to copy (analysis may still be pending)');
      }

      // Update original Stock Analyses page to "Logged in History"
      await this.client.pages.update({
        page_id: pageId,
        properties: {
          'Content Status': { select: { name: 'Logged in History' } },
        },
      });

      console.log('✅ Stock Analyses page marked as "Logged in History"');
      console.log('🎉 Archival complete!');

      return historyPage.id;
    } catch (error) {
      console.error('❌ Exception during archival:', error);
      return null;
    }
  }

  /**
   * Archive by ticker name instead of page ID
   * Convenience method for manual archiving
   */
  async archiveTickerToHistory(ticker: string): Promise<string | null> {
    const pageId = await this.findPageByTicker(
      this.stockAnalysesDbId,
      ticker,
      'title'
    );

    if (!pageId) {
      console.error(`⚠️  No page found for ticker: ${ticker}`);
      return null;
    }

    return this.archiveToHistory(pageId);
  }

  /**
   * Update the Content Status property of a Notion page
   *
   * @param pageId - Notion page ID or URL
   * @param status - New status value. For Stock Analyses: "Pending Analysis" | "Send to History" | "Logged in History" | "Analysis Incomplete" | "New" | "Updated"
   *                 For Stock History: "New" | "Historical"
   * @returns Promise that resolves when update is complete
   *
   * @example
   * ```typescript
   * // Mark analysis ready for review
   * await notionClient.updateContentStatus(pageId, "Send to History");
   *
   * // Mark analysis completed
   * await notionClient.updateContentStatus(pageId, "Logged in History");
   * ```
   */
  async updateContentStatus(
    pageId: string,
    status: ContentStatus
  ): Promise<void> {
    try {
      // Extract page ID from URL if full URL provided
      const id = pageId.includes('notion.so')
        ? pageId.split('/').pop()?.split('?')[0].replace(/-/g, '')
        : pageId;

      if (!id) {
        throw new Error('Invalid page ID or URL');
      }

      await this.client.pages.update({
        page_id: id,
        properties: {
          'Content Status': {
            select: { name: status },
          },
        },
      });

      console.log(`✅ Updated Content Status to "${status}"`);
    } catch (error) {
      console.error('❌ Error updating Content Status:', error);
      throw error;
    }
  }

  /**
   * Write error message to page Notes property and set status to Error
   *
   * @param pageId - Notion page ID
   * @param errorMessage - Error message to write (will be truncated to 2000 chars)
   */
  async writeErrorToPage(pageId: string, errorMessage: string): Promise<void> {
    try {
      // Extract page ID from URL if full URL provided
      const id = pageId.includes('notion.so')
        ? pageId.split('/').pop()?.split('?')[0].replace(/-/g, '')
        : pageId;

      if (!id) {
        throw new Error('Invalid page ID or URL');
      }

      await this.client.pages.update({
        page_id: id,
        properties: {
          Notes: {
            rich_text: [
              {
                text: {
                  content: errorMessage.substring(0, 2000), // Notion limit
                },
              },
            ],
          },
          'Content Status': {
            select: {
              name: 'Error',
            },
          },
        },
      });

      console.log(`✅ Error written to Notion page ${id}`);
    } catch (error) {
      console.error('❌ Failed to write error to Notion:', error);
      // Don't throw - we don't want to fail the request just because we couldn't write to Notion
    }
  }

  /**
   * Clean property value for copying to different database
   * Removes database-specific IDs
   */
  private cleanPropertyValue(propValue: any): any {
    if (!propValue || typeof propValue !== 'object') {
      return null;
    }

    const type = propValue.type;

    switch (type) {
      case 'title':
        return {
          title:
            propValue.title?.map((item: any) => ({
              text: { content: item.plain_text },
            })) || [],
        };

      case 'rich_text':
        return {
          rich_text:
            propValue.rich_text?.map((item: any) => ({
              text: { content: item.plain_text },
            })) || [],
        };

      case 'number':
        return { number: propValue.number };

      case 'select':
        return propValue.select?.name
          ? { select: { name: propValue.select.name } }
          : null;

      case 'multi_select':
        return {
          multi_select:
            propValue.multi_select?.map((item: any) => ({ name: item.name })) ||
            [],
        };

      case 'date':
        return propValue.date ? { date: propValue.date } : null;

      case 'checkbox':
        return { checkbox: propValue.checkbox };

      case 'url':
        return propValue.url ? { url: propValue.url } : null;

      case 'email':
        return propValue.email ? { email: propValue.email } : null;

      case 'phone_number':
        return propValue.phone_number
          ? { phone_number: propValue.phone_number }
          : null;

      default:
        // Skip unsupported property types
        return null;
    }
  }
}

/**
 * Create Notion client instance
 */
export function createNotionClient(config: NotionConfig): NotionClient {
  return new NotionClient(config);
}

export type { NotionConfig, AnalysisData, ContentStatus };
