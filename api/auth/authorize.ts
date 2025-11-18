/**
 * OAuth Authorization Endpoint
 *
 * Initiates the Notion OAuth flow by redirecting to Notion's authorization page.
 * User will be prompted to select which pages to share with the integration.
 *
 * v1.2.7 Fix: Only include template_id for NEW users to prevent duplicate templates
 * for existing users during re-authentication.
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { log, LogLevel } from '../../lib/logger';
import { validateSession } from '../../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
    const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI;
    const templateId = process.env.SAGE_STOCKS_TEMPLATE_ID;

    if (!clientId || !redirectUri) {
      log(LogLevel.ERROR, 'OAuth configuration missing', {
        hasClientId: !!clientId,
        hasRedirectUri: !!redirectUri,
      });

      res.status(500).json({
        success: false,
        error: 'OAuth not configured',
        message: 'Server configuration error. Please contact support.',
      });
      return;
    }

    // Check if user is existing (from frontend query param or session cookie)
    const existingUserParam = req.query.existing_user === 'true';
    const session = await validateSession(req);
    const isExistingUser = existingUserParam || !!session;

    // Build Notion OAuth authorization URL
    const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('owner', 'user');

    // Only include template_id for NEW users (prevents duplicate templates)
    if (templateId && !isExistingUser) {
      authUrl.searchParams.set('template_id', templateId);
      log(LogLevel.INFO, 'New user: Including template_id in OAuth flow', {
        redirectUri,
        templateId,
        reason: 'new_user',
      });
    } else if (templateId && isExistingUser) {
      log(LogLevel.INFO, 'Existing user: Skipping template_id to prevent duplication', {
        redirectUri,
        hasSession: !!session,
        existingUserParam,
        reason: 'prevent_duplicate',
      });
    } else {
      log(LogLevel.WARN, 'SAGE_STOCKS_TEMPLATE_ID not set - template will NOT be duplicated', {
        redirectUri,
      });
    }

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
