/**
 * OAuth Authorization Endpoint
 *
 * Initiates the Notion OAuth flow by redirecting to Notion's authorization page.
 * User will be prompted to select which pages to share with the integration.
 *
 * v1.2.14: Simplified - template checking happens in frontend before OAuth.
 * This endpoint NEVER includes template_id parameter (manual duplication only).
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { log, LogLevel } from '../../lib/logger';
import { validateSession } from '../../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
    const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI;

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

    const emailParam = req.query.email as string | undefined;
    const session = await validateSession(req);

    log(LogLevel.INFO, 'OAuth authorization request', {
      hasSession: !!session,
      hasEmailParam: !!emailParam,
      sessionUserId: session?.userId,
      sessionNotionUserId: session?.notionUserId,
    });

    // Build Notion OAuth authorization URL
    const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('owner', 'user');

    // Pass session data through OAuth state parameter (for callback to use)
    if (session) {
      const stateData = {
        userId: session.userId,
        notionUserId: session.notionUserId,
        timestamp: Date.now(),
      };
      authUrl.searchParams.set('state', Buffer.from(JSON.stringify(stateData)).toString('base64'));
      log(LogLevel.INFO, 'OAuth state parameter set', {
        userId: session.userId,
        notionUserId: session.notionUserId,
      });
    }

    // v1.2.14: NEVER include template_id
    // Template duplication is manual (Step 1.5) - happens BEFORE OAuth
    // This ensures Notion never auto-duplicates templates

    // CRITICAL DIAGNOSTIC: Log the actual OAuth URL being constructed
    const finalUrl = authUrl.toString();
    const urlParams = new URLSearchParams(new URL(finalUrl).search);
    const hasTemplateIdInUrl = urlParams.has('template_id');

    log(LogLevel.WARN, 'CRITICAL: OAuth URL constructed - checking for template_id', {
      reason: 'v1.2.14_manual_duplication_before_oauth',
      hasSession: !!session,
      hasTemplateIdInUrl,
      templateIdValue: hasTemplateIdInUrl ? urlParams.get('template_id') : null,
      completeUrl: finalUrl,
      allParams: Object.fromEntries(urlParams.entries()),
    });

    if (hasTemplateIdInUrl) {
      log(LogLevel.ERROR, 'CRITICAL BUG: template_id found in OAuth URL despite prevention code!', {
        templateIdValue: urlParams.get('template_id'),
        completeUrl: finalUrl,
      });
    }

    // IMPORTANT: Do NOT add template_id to authUrl under ANY circumstances
    // Template duplication is handled manually in frontend Step 1.5
    res.redirect(finalUrl);
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
