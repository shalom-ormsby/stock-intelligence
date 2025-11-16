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

    // v1.2.5 Bug Fix: Multi-layered detection to prevent duplicate templates
    // Checks: (1) URL parameter, (2) Session cookie presence, (3) Active session validation
    let shouldIncludeTemplate = true;
    let userSetupStatus = 'unknown';
    let detectionMethod = 'none';

    try {
      // Layer 1: Check for explicit URL parameter from frontend
      // Frontend should set this based on localStorage or existing session
      const existingUserParam = req.query?.existing_user === 'true';
      if (existingUserParam) {
        shouldIncludeTemplate = false;
        userSetupStatus = 'existing_via_param';
        detectionMethod = 'url_parameter';
        log(LogLevel.INFO, 'Existing user detected via URL parameter - skipping template duplication', {
          existingUserParam,
        });
      }

      // Layer 2: Check for session cookie presence (even if expired in Redis)
      // If a user has ANY session cookie, they're likely a returning user
      if (shouldIncludeTemplate) {
        const cookies = req.headers.cookie || '';
        const hasSessionCookie = cookies.includes('si_session=');

        if (hasSessionCookie) {
          // User has a session cookie - likely returning user
          // Try to validate the session to get more info
          const session = await validateSession(req);

          if (session) {
            // Valid session - definitely a returning user
            const user = await getUserByEmail(session.email);

            if (user && user.stockAnalysesDbId && user.stockHistoryDbId && user.sageStocksPageId) {
              // User has completed setup - DON'T duplicate
              shouldIncludeTemplate = false;
              userSetupStatus = 'setup_complete';
              detectionMethod = 'valid_session';
              log(LogLevel.INFO, 'Existing user detected via valid session - skipping template duplication', {
                email: session.email,
                hasStockAnalysesDb: !!user.stockAnalysesDbId,
                hasStockHistoryDb: !!user.stockHistoryDbId,
                hasSageStocksPage: !!user.sageStocksPageId,
              });
            } else {
              userSetupStatus = 'setup_incomplete';
              detectionMethod = 'valid_session_incomplete_setup';
            }
          } else {
            // Cookie exists but session expired in Redis
            // Conservative approach: Skip template to avoid duplicates
            shouldIncludeTemplate = false;
            userSetupStatus = 'expired_session_cookie';
            detectionMethod = 'expired_cookie';
            log(LogLevel.WARN, 'Session cookie exists but expired in Redis - assuming returning user to prevent duplicate', {
              hasSessionCookie,
            });
          }
        } else {
          userSetupStatus = 'no_session_cookie';
          detectionMethod = 'no_cookie';
        }
      }
    } catch (error) {
      // All detection failed - treat as new user (safer to duplicate than to skip for truly new users)
      log(LogLevel.INFO, 'Could not detect existing user status (treating as new user)', {
        error: error instanceof Error ? error.message : String(error),
      });
      userSetupStatus = 'detection_failed';
      detectionMethod = 'error';
      shouldIncludeTemplate = true; // Default to including template for new users
    }

    // Add template_id only if user is new or hasn't completed setup
    if (templateId && shouldIncludeTemplate) {
      authUrl.searchParams.set('template_id', templateId);
      log(LogLevel.INFO, 'OAuth flow includes template_id (new user)', {
        templateId,
        userSetupStatus,
        detectionMethod,
      });
    } else if (templateId && !shouldIncludeTemplate) {
      log(LogLevel.INFO, 'OAuth flow SKIPPING template_id (existing user detected)', {
        userSetupStatus,
        detectionMethod,
      });
    } else {
      log(LogLevel.ERROR, 'CRITICAL: SAGE_STOCKS_TEMPLATE_ID not set - template will NOT be duplicated automatically', {
        hasClientId: !!clientId,
        hasRedirectUri: !!redirectUri,
        hasTemplateId: !!templateId,
        userSetupStatus,
        detectionMethod,
      });
    }

    log(LogLevel.INFO, 'Redirecting to Notion OAuth', {
      redirectUri,
      includesTemplateId: shouldIncludeTemplate && !!templateId,
      userSetupStatus,
      detectionMethod,
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
