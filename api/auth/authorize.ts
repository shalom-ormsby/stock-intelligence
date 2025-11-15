/**
 * OAuth Authorization Endpoint
 *
 * Initiates the Notion OAuth flow by redirecting to Notion's authorization page.
 * User will be prompted to select which pages to share with the integration.
 *
 * v1.2.4 Bug Fix: Only include template_id for NEW users to prevent duplicate templates
 * when existing users re-authenticate.
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { log, LogLevel } from '../../lib/logger';
import { validateSession, getUserByEmail } from '../../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
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

    // v1.2.4 Bug Fix: Check if user has already completed setup
    // Only include template_id for NEW users to prevent duplicate templates
    // when existing users re-authenticate (e.g., after API upgrade, token expiry)
    let shouldIncludeTemplate = true;
    let userSetupStatus = 'unknown';

    try {
      // Try to get existing session (will fail silently if no session or expired)
      const session = await validateSession(req);

      if (session) {
        // User has a session - check if they've completed setup
        const user = await getUserByEmail(session.email);

        if (user && user.stockAnalysesDbId && user.stockHistoryDbId && user.sageStocksPageId) {
          // User has already completed setup - DON'T duplicate template
          shouldIncludeTemplate = false;
          userSetupStatus = 'setup_complete';
          log(LogLevel.INFO, 'Existing user re-authenticating - skipping template duplication', {
            email: session.email,
            hasStockAnalysesDb: !!user.stockAnalysesDbId,
            hasStockHistoryDb: !!user.stockHistoryDbId,
            hasSageStocksPage: !!user.sageStocksPageId,
          });
        } else {
          userSetupStatus = 'setup_incomplete';
        }
      } else {
        userSetupStatus = 'no_session';
      }
    } catch (error) {
      // Session validation failed or user lookup failed - treat as new user
      log(LogLevel.INFO, 'Could not validate existing user session (treating as new user)', {
        error: error instanceof Error ? error.message : String(error),
      });
      userSetupStatus = 'validation_failed';
    }

    // Add template_id only if user is new or hasn't completed setup
    if (templateId && shouldIncludeTemplate) {
      authUrl.searchParams.set('template_id', templateId);
      log(LogLevel.INFO, 'OAuth flow includes template_id (new user)', {
        templateId,
        userSetupStatus,
      });
    } else if (templateId && !shouldIncludeTemplate) {
      log(LogLevel.INFO, 'OAuth flow SKIPPING template_id (existing user with setup complete)', {
        userSetupStatus,
      });
    } else {
      log(LogLevel.ERROR, 'CRITICAL: SAGE_STOCKS_TEMPLATE_ID not set - template will NOT be duplicated automatically', {
        hasClientId: !!clientId,
        hasRedirectUri: !!redirectUri,
        hasTemplateId: !!templateId,
        userSetupStatus,
      });
    }

    log(LogLevel.INFO, 'Redirecting to Notion OAuth', {
      redirectUri,
      includesTemplateId: shouldIncludeTemplate && !!templateId,
      userSetupStatus,
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
