/**
 * Template URL Endpoint
 *
 * Provides the Notion template URL for users to duplicate.
 * Returns the template page URL based on the configured SAGE_STOCKS_TEMPLATE_ID.
 *
 * v1.2.13: Manual template duplication flow
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { log, LogLevel } from '../../lib/logger';

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const templateId = process.env.SAGE_STOCKS_TEMPLATE_ID;

    if (!templateId) {
      log(LogLevel.ERROR, 'SAGE_STOCKS_TEMPLATE_ID not configured');
      res.status(500).json({
        success: false,
        error: 'Template not configured',
        message: 'Server configuration error. Please contact support.',
      });
      return;
    }

    // Notion template URL format: https://www.notion.so/[template-id]
    // When user visits this URL while logged into Notion, they'll see the template
    // with a "Duplicate" button in the top-right corner
    const templateUrl = `https://www.notion.so/${templateId}`;

    log(LogLevel.INFO, 'Template URL requested', {
      templateId,
      templateUrl,
    });

    res.status(200).json({
      success: true,
      url: templateUrl,
      templateId,
    });
  } catch (error) {
    log(LogLevel.ERROR, 'Template URL endpoint error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get template URL',
    });
  }
}
