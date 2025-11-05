/**
 * OAuth Callback Endpoint
 *
 * Handles the OAuth callback from Notion after user authorizes the integration.
 * Exchanges the authorization code for an access token, creates/updates user record,
 * and creates a session if the user is approved.
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { log, LogLevel } from '../../lib/logger';
import {
  storeUserSession,
  createOrUpdateUser,
} from '../../lib/auth';

interface NotionOAuthTokenResponse {
  access_token: string;
  bot_id: string;
  workspace_id: string;
  workspace_name: string;
  workspace_icon: string | null;
  owner: {
    type: 'user';
    user: {
      object: 'user';
      id: string;
      name: string | null;
      avatar_url: string | null;
      type: 'person';
      person: {
        email: string;
      };
    };
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { code, error: oauthError } = req.query;

    // Handle OAuth errors (user denied access, etc.)
    if (oauthError) {
      log(LogLevel.WARN, 'OAuth authorization denied', { error: oauthError });
      return res.redirect('/?error=access_denied');
    }

    // Validate authorization code
    if (!code || typeof code !== 'string') {
      log(LogLevel.WARN, 'Missing authorization code');
      return res.redirect('/?error=missing_code');
    }

    const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
    const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      log(LogLevel.ERROR, 'OAuth configuration incomplete');
      return res.redirect('/?error=server_config');
    }

    // Step 1: Exchange authorization code for access token
    log(LogLevel.INFO, 'Exchanging authorization code for token');

    const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      log(LogLevel.ERROR, 'Token exchange failed', {
        status: tokenResponse.status,
        error: errorText,
      });
      return res.redirect('/?error=token_exchange_failed');
    }

    const tokenData = await tokenResponse.json() as NotionOAuthTokenResponse;

    // Step 2: Extract user information
    const userId = tokenData.owner.user.id;
    const userEmail = tokenData.owner.user.person.email;
    const userName = tokenData.owner.user.name || userEmail.split('@')[0];
    const workspaceId = tokenData.workspace_id;
    const accessToken = tokenData.access_token;

    log(LogLevel.INFO, 'OAuth token received', {
      userId,
      email: userEmail,
      workspaceId,
    });

    // Step 3: Create or update user in Beta Users database
    const user = await createOrUpdateUser({
      notionUserId: userId,
      email: userEmail,
      name: userName,
      workspaceId,
      accessToken, // Will be encrypted by createOrUpdateUser
    });

    log(LogLevel.INFO, 'User record saved', {
      userId: user.id,
      status: user.status,
    });

    // Auto-approve admin email
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail && userEmail.toLowerCase() === adminEmail.toLowerCase() && user.status !== 'approved') {
      log(LogLevel.INFO, 'Auto-approving admin user', { email: userEmail });
      const { updateUserStatus } = await import('../../lib/auth');
      await updateUserStatus(user.id, 'approved');
      user.status = 'approved'; // Update local copy
    }

    // Step 4: Check approval status
    if (user.status === 'pending') {
      log(LogLevel.INFO, 'User pending approval', { email: userEmail });
      return res.redirect('/?status=pending');
    }

    if (user.status === 'denied') {
      log(LogLevel.INFO, 'User access denied', { email: userEmail });
      return res.redirect('/?status=denied');
    }

    // Step 5: User is approved - create session
    if (user.status === 'approved') {
      await storeUserSession(res, {
        userId: user.id,
        email: user.email,
        name: user.name,
        notionUserId: user.notionUserId,
      });

      log(LogLevel.INFO, 'Session created for approved user', {
        email: userEmail,
      });

      // Redirect to analyzer
      return res.redirect('/analyze.html');
    }

    // Fallback (should never reach here)
    log(LogLevel.ERROR, 'Unexpected user status', { status: user.status });
    return res.redirect('/?error=unknown_status');
  } catch (error) {
    log(LogLevel.ERROR, 'OAuth callback error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return res.redirect('/?error=oauth_failed');
  }
}
