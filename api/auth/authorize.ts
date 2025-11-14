/**
 * OAuth Authorization Endpoint
 *
 * Initiates the Notion OAuth flow by redirecting to Notion's authorization page.
 * User will be prompted to select which pages to share with the integration.
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { log, LogLevel } from '../../lib/logger';

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
    const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI;
    const templateId = process.env.SAGE_STOCKS_TEMPLATE_ID;

    if (!clientId || !redirectUri) {
      log(LogLevel.ERROR, 'OAuth configuration missing', {
        hasClientId: !!clientId,
        hasRedirectUri: !!redirectUri,
        hasTemplateId: !!templateId,
      });

      res.status(500).json({
        success: false,
        error: 'OAuth not configured',
        message: 'Server configuration error. Please contact support.',
      });
      return;
    }

    // Build Notion OAuth authorization URL
    const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('owner', 'user');

    // Add template_id if configured (v1.2.1 - Fix for beta tester template duplication bug)
    // This tells Notion which template to show during OAuth flow
    // Template ID format: 32-char hex without dashes (e.g., ce9b3a07e96a41c3ac1cc2a99f92bd90)
    if (templateId) {
      authUrl.searchParams.set('template_id', templateId);
      log(LogLevel.INFO, 'OAuth flow includes template_id', { templateId });
    } else {
      log(LogLevel.WARN, 'OAuth flow without template_id - falling back to integration settings');
    }

    log(LogLevel.INFO, 'Redirecting to Notion OAuth', {
      redirectUri,
      hasTemplateId: !!templateId,
    });

    // Redirect to Notion OAuth page
    res.redirect(authUrl.toString());
  } catch (error) {
    log(LogLevel.ERROR, 'Authorization endpoint error', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Authorization failed',
      message: 'An unexpected error occurred. Please try again.',
    });
  }
}
