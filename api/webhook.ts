/**
 * Notion Webhook Handler
 *
 * Receives webhook events from Notion database automations.
 *
 * Handles two types of events:
 * 1. New analysis trigger: Extracts ticker and triggers analysis
 * 2. Archive trigger: Moves completed analysis to Stock History
 *
 * Setup in Notion:
 * - For new analysis: Create automation → Call webhook with ticker
 * - For archiving: "Send to History" button → Call webhook with page ID + action=archive
 * - Webhook URL: https://your-app.vercel.app/api/webhook
 *
 * v1.0 - Vercel Serverless + TypeScript
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { createNotionClient } from '../lib/notion-client';

interface NotionWebhookPayload {
  type?: string;
  action?: string; // 'archive' for Send to History button
  pageId?: string; // Page ID for archiving
  page?: {
    id: string;
    properties?: Record<string, any>;
  };
  database?: {
    id: string;
  };
}

interface WebhookResponse {
  success: boolean;
  ticker?: string;
  analysisTriggered?: boolean;
  archiveTriggered?: boolean;
  historyPageId?: string;
  message?: string;
  error?: string;
  details?: string;
}

/**
 * Verify Notion webhook signature
 * Notion signs webhooks with HMAC-SHA256
 */
function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Extract ticker from Notion page properties
 */
function extractTicker(properties: Record<string, any>): string | null {
  // Try different property names
  const tickerProperty =
    properties['Ticker'] ||
    properties['ticker'] ||
    properties['Symbol'] ||
    properties['symbol'];

  if (!tickerProperty) {
    return null;
  }

  // Handle different property types
  if (tickerProperty.type === 'title' && tickerProperty.title?.length > 0) {
    return tickerProperty.title[0].plain_text;
  }

  if (tickerProperty.type === 'rich_text' && tickerProperty.rich_text?.length > 0) {
    return tickerProperty.rich_text[0].plain_text;
  }

  if (tickerProperty.type === 'text' && tickerProperty.text?.length > 0) {
    return tickerProperty.text[0].plain_text;
  }

  return null;
}

/**
 * Main webhook handler
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  console.log('='.repeat(60));
  console.log('Notion webhook received');
  console.log('='.repeat(60));

  // Only accept POST requests
  if (req.method !== 'POST') {
    console.log('❌ Method not allowed:', req.method);
    res.status(405).json({
      success: false,
      error: 'Method not allowed',
      details: 'Only POST requests are accepted',
    });
    return;
  }

  try {
    // Get webhook secret from environment
    const webhookSecret = process.env.NOTION_WEBHOOK_SECRET;

    // Verify signature if secret is configured
    if (webhookSecret) {
      const signature = req.headers['notion-signature'] as string;

      if (!signature) {
        console.log('❌ Missing signature header');
        res.status(401).json({
          success: false,
          error: 'Missing signature',
          details: 'Notion-Signature header is required',
        });
        return;
      }

      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

      if (!verifySignature(rawBody, signature, webhookSecret)) {
        console.log('❌ Invalid signature');
        res.status(401).json({
          success: false,
          error: 'Invalid signature',
          details: 'Webhook signature verification failed',
        });
        return;
      }

      console.log('✅ Signature verified');
    } else {
      console.log('⚠️  No webhook secret configured - skipping signature verification');
    }

    // Parse webhook payload
    const payload: NotionWebhookPayload =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    console.log('Webhook type:', payload.type);
    console.log('Webhook action:', payload.action);

    // Handle archive request (Send to History button)
    if (payload.action === 'archive') {
      console.log('📦 Archive request received');

      const pageId = payload.pageId || payload.page?.id;
      if (!pageId) {
        console.log('❌ No page ID provided for archiving');
        res.status(400).json({
          success: false,
          error: 'Missing page ID',
          details: 'Archive action requires pageId in payload',
        });
        return;
      }

      console.log(`Archiving page: ${pageId}`);

      // Initialize Notion client
      const notionApiKey = process.env.NOTION_API_KEY;
      const stockAnalysesDbId = process.env.STOCK_ANALYSES_DB_ID;
      const stockHistoryDbId = process.env.STOCK_HISTORY_DB_ID;

      if (!notionApiKey || !stockAnalysesDbId || !stockHistoryDbId) {
        console.log('❌ Missing required environment variables');
        res.status(500).json({
          success: false,
          error: 'Server configuration error',
          details: 'Missing Notion API credentials',
        });
        return;
      }

      const notionClient = createNotionClient({
        apiKey: notionApiKey,
        stockAnalysesDbId,
        stockHistoryDbId,
      });

      try {
        const historyPageId = await notionClient.archiveToHistory(pageId);

        if (historyPageId) {
          console.log(`✅ Successfully archived to history: ${historyPageId}`);
          res.status(200).json({
            success: true,
            archiveTriggered: true,
            historyPageId,
            message: 'Analysis successfully archived to Stock History',
          });
          return;
        } else {
          console.log('❌ Archive operation returned null');
          res.status(500).json({
            success: false,
            archiveTriggered: false,
            error: 'Archive failed',
            details: 'archiveToHistory() returned null',
          });
          return;
        }
      } catch (error) {
        console.error('❌ Archive error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
          success: false,
          archiveTriggered: false,
          error: 'Archive operation failed',
          details: errorMessage,
        });
        return;
      }
    }

    // Handle new analysis trigger (original behavior)
    // Extract ticker from page properties
    if (!payload.page?.properties) {
      console.log('❌ No page properties in webhook payload');
      res.status(400).json({
        success: false,
        error: 'Invalid payload',
        details: 'Webhook payload must include page.properties',
      });
      return;
    }

    const ticker = extractTicker(payload.page.properties);

    if (!ticker) {
      console.log('❌ No ticker found in page properties');
      res.status(400).json({
        success: false,
        error: 'Missing ticker',
        details: 'Could not find Ticker property in page',
      });
      return;
    }

    const tickerUpper = ticker.toUpperCase().trim();
    console.log(`✅ Ticker extracted: ${tickerUpper}`);

    // Trigger analysis endpoint
    console.log('🚀 Triggering analysis...');

    const analysisUrl = `${req.headers.origin || process.env.VERCEL_URL || 'http://localhost:3000'}/api/analyze`;

    console.log(`Calling: ${analysisUrl}`);

    const analysisResponse = await fetch(analysisUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ticker: tickerUpper,
        usePollingWorkflow: true,
        timeout: 600,
        pollInterval: 10,
        skipPolling: false,
      }),
    });

    if (!analysisResponse.ok) {
      const errorData = await analysisResponse.json() as any;
      console.log('❌ Analysis endpoint failed:', errorData);

      res.status(500).json({
        success: false,
        ticker: tickerUpper,
        analysisTriggered: false,
        error: 'Analysis failed',
        details: errorData.error || 'Unknown error from analysis endpoint',
      });
      return;
    }

    const analysisData = await analysisResponse.json() as any;
    console.log('✅ Analysis triggered successfully');
    console.log(`   Page ID: ${analysisData.analysesPageId}`);
    console.log(`   Composite Score: ${analysisData.scores?.composite}`);
    console.log(`   Recommendation: ${analysisData.scores?.recommendation}`);

    console.log('='.repeat(60) + '\n');

    // Return success response
    const response: WebhookResponse = {
      success: true,
      ticker: tickerUpper,
      analysisTriggered: true,
      message: `Analysis triggered for ${tickerUpper}. Check Notion for results.`,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('❌ Webhook handler error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    const response: WebhookResponse = {
      success: false,
      analysisTriggered: false,
      error: errorMessage,
      details: errorStack,
    };

    res.status(500).json(response);
  }
}
