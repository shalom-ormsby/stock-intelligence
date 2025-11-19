/**
 * OAuth Authorization Endpoint
 *
 * Initiates the Notion OAuth flow by redirecting to Notion's authorization page.
 * User will be prompted to select which pages to share with the integration.
 *
 * v1.2.10 Fix: Database-backed existing user detection to prevent duplicate templates
 * even when session is missing. Uses OAuth state parameter to pass session data.
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { log, LogLevel } from '../../lib/logger';
import { validateSession, getUserByNotionId } from '../../lib/auth';

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
    let isExistingUser = existingUserParam || !!session;

    log(LogLevel.INFO, 'OAuth authorization request received', {
      existingUserParam,
      hasSession: !!session,
      sessionUserId: session?.userId,
      sessionNotionUserId: session?.notionUserId,
      isExistingUser,
    });

    // v1.2.10: CRITICAL FIX - Database-backed check for existing users
    // If user has a session, check database to see if they already have a template
    let hasExistingTemplate = false;
    if (session?.notionUserId) {
      try {
        const existingUser = await getUserByNotionId(session.notionUserId);
        hasExistingTemplate = !!(existingUser?.sageStocksPageId);

        log(LogLevel.INFO, 'Database check for existing template', {
          notionUserId: session.notionUserId,
          userId: existingUser?.id,
          hasSageStocksPageId: hasExistingTemplate,
          sageStocksPageId: existingUser?.sageStocksPageId,
        });

        // If user has a template in database, treat them as existing user regardless of param
        if (hasExistingTemplate) {
          isExistingUser = true;
          log(LogLevel.WARN, 'FORCING existing user flag based on database check', {
            reason: 'user_has_sage_stocks_page_in_database',
            notionUserId: session.notionUserId,
            sageStocksPageId: existingUser?.sageStocksPageId,
            willSkipTemplateId: true,
          });
        }
      } catch (dbError) {
        log(LogLevel.ERROR, 'Database check failed (non-critical, continuing with session-based detection)', {
          error: dbError instanceof Error ? dbError.message : String(dbError),
          notionUserId: session.notionUserId,
        });
        // Continue with session-based detection if database check fails
      }
    }

    // Build Notion OAuth authorization URL
    const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('owner', 'user');

    // Pass session data through OAuth state parameter (for callback to use)
    // This allows callback to immediately detect existing users even if template_id was wrongly included
    if (session) {
      const stateData = {
        userId: session.userId,
        notionUserId: session.notionUserId,
        hasExistingTemplate,
        timestamp: Date.now(),
      };
      authUrl.searchParams.set('state', Buffer.from(JSON.stringify(stateData)).toString('base64'));
      log(LogLevel.INFO, 'Passing session data through OAuth state parameter', {
        userId: session.userId,
        notionUserId: session.notionUserId,
        hasExistingTemplate,
      });
    }

    // Only include template_id for NEW users (prevents duplicate templates)
    if (templateId && !isExistingUser) {
      authUrl.searchParams.set('template_id', templateId);
      log(LogLevel.INFO, 'New user: Including template_id in OAuth flow', {
        redirectUri,
        templateId,
        reason: 'new_user',
        hasSession: !!session,
        existingUserParam,
        hasExistingTemplate,
      });
    } else if (templateId && isExistingUser) {
      log(LogLevel.WARN, 'EXISTING USER: Skipping template_id to prevent duplication', {
        redirectUri,
        hasSession: !!session,
        existingUserParam,
        hasExistingTemplate,
        reason: hasExistingTemplate ? 'database_has_sage_stocks_page' : 'session_or_param_detected',
        notionUserId: session?.notionUserId,
      });
    } else {
      log(LogLevel.WARN, 'SAGE_STOCKS_TEMPLATE_ID not set - template will NOT be duplicated', {
        redirectUri,
      });
    }

    // Redirect to Notion OAuth page
    log(LogLevel.INFO, 'Redirecting to Notion OAuth', {
      includesTemplateId: authUrl.searchParams.has('template_id'),
      includesState: authUrl.searchParams.has('state'),
      isExistingUser,
      hasExistingTemplate,
    });
    res.redirect(authUrl.toString());
  } catch (error) {
    log(LogLevel.ERROR, 'Authorization endpoint error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      success: false,
      error: 'Authorization failed',
      message: 'An unexpected error occurred. Please try again.',
    });
  }
}
