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
  updateUserStatus,
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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const { code, error: oauthError, state } = req.query;

    // Handle OAuth errors (user denied access, etc.)
    if (oauthError) {
      log(LogLevel.WARN, 'OAuth authorization denied', { error: oauthError });
      res.redirect('/?error=access_denied');
      return;
    }

    // Validate authorization code
    if (!code || typeof code !== 'string') {
      log(LogLevel.WARN, 'Missing authorization code');
      res.redirect('/?error=missing_code');
      return;
    }

    // v1.2.10: Parse OAuth state parameter (contains session data from authorize.ts)
    let stateData: { userId?: string; notionUserId?: string; hasExistingTemplate?: boolean; timestamp?: number } | null = null;
    if (state && typeof state === 'string') {
      try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
        log(LogLevel.INFO, 'OAuth state parameter received', {
          userId: stateData?.userId,
          notionUserId: stateData?.notionUserId,
          hasExistingTemplate: stateData?.hasExistingTemplate,
          timestamp: stateData?.timestamp,
          ageSeconds: stateData?.timestamp ? Math.floor((Date.now() - stateData.timestamp) / 1000) : undefined,
        });
      } catch (stateError) {
        log(LogLevel.WARN, 'Failed to parse OAuth state parameter (non-critical)', {
          error: stateError instanceof Error ? stateError.message : String(stateError),
          state,
        });
      }
    } else {
      log(LogLevel.INFO, 'No OAuth state parameter (user likely started OAuth without session)', {
        hasState: !!state,
      });
    }

    const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
    const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      log(LogLevel.ERROR, 'OAuth configuration incomplete');
      res.redirect('/?error=server_config');
      return;
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
      res.redirect('/?error=token_exchange_failed');
      return;
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

    // STEP 3: Check if user already exists (BEFORE template check)
    const { getUserByNotionId } = await import('../../lib/auth');
    const existingUser = await getUserByNotionId(userId);

    log(LogLevel.INFO, 'Existing user check', {
      userId,
      email: userEmail,
      isExistingUser: !!existingUser,
      existingUserId: existingUser?.id,
      existingSageStocksPageId: existingUser?.sageStocksPageId,
      stateDataHasExistingTemplate: stateData?.hasExistingTemplate,
    });

    // v1.2.10 CRITICAL FIX: AGGRESSIVE duplicate template detection and cleanup
    // This runs IMMEDIATELY after OAuth to catch and archive duplicates before user sees them
    let sageStocksPages: any[] = [];
    let userNotion: any = null;

    try {
      const { Client } = await import('@notionhq/client');
      userNotion = new Client({ auth: accessToken, notionVersion: '2025-09-03' });

      log(LogLevel.INFO, 'Searching for Sage Stocks templates in workspace...', {
        userId,
        email: userEmail,
        isExistingUser: !!existingUser,
        stateDataIndicatesExistingTemplate: stateData?.hasExistingTemplate,
      });

      const searchResults = await userNotion.search({
        filter: { property: 'object', value: 'page' },
        page_size: 100, // Increased to catch all pages
      });

      // Find ALL Sage Stocks pages
      sageStocksPages = searchResults.results.filter((p: any) =>
        p.object === 'page' &&
        p.properties?.title?.title?.[0]?.plain_text?.includes('Sage Stocks')
      );

      log(LogLevel.WARN, 'Template search complete', {
        totalPagesAccessible: searchResults.results.length,
        sageStocksFoundCount: sageStocksPages.length,
        sageStocksIds: sageStocksPages.map((p: any) => p.id),
        sageStocksCreatedTimes: sageStocksPages.map((p: any) => ({ id: p.id, created: p.created_time })),
        templateIdWasSet: !!process.env.SAGE_STOCKS_TEMPLATE_ID,
        userIsExisting: !!existingUser,
        userHasSavedPageId: !!existingUser?.sageStocksPageId,
        stateDataHasExistingTemplate: stateData?.hasExistingTemplate,
      });

      if (sageStocksPages.length === 0 && process.env.SAGE_STOCKS_TEMPLATE_ID) {
        log(LogLevel.WARN, 'Template was NOT duplicated during OAuth despite template_id being set', {
          templateId: process.env.SAGE_STOCKS_TEMPLATE_ID,
          pagesFound: searchResults.results.length,
          userEmail,
          isExistingUser: !!existingUser,
        });
      }
    } catch (diagError) {
      log(LogLevel.ERROR, 'Template search failed (non-critical)', {
        error: diagError instanceof Error ? diagError.message : String(diagError),
        userEmail,
      });
    }

    // STEP 4: AGGRESSIVE cleanup for duplicate templates
    // v1.2.10: Enhanced logic - archive duplicates OR wrongly created templates for existing users

    // Case 1: Multiple Sage Stocks pages detected for existing user
    if (existingUser && sageStocksPages.length > 1) {
      log(LogLevel.ERROR, '🚨 DUPLICATE DETECTED: Multiple Sage Stocks templates found for existing user', {
        userId: existingUser.id,
        email: userEmail,
        existingSageStocksPageId: existingUser.sageStocksPageId,
        foundSageStocksPages: sageStocksPages.length,
        pageIds: sageStocksPages.map((p: any) => p.id),
        createdTimes: sageStocksPages.map((p: any) => ({ id: p.id, created: p.created_time })),
        stateDataHadExistingTemplateFlag: stateData?.hasExistingTemplate,
      });

      let pageToKeep: any = null;
      let duplicatePages: any[] = [];

      // Strategy 1: If user has a saved page ID, verify it still exists
      if (existingUser.sageStocksPageId) {
        pageToKeep = sageStocksPages.find((p: any) => p.id === existingUser.sageStocksPageId);

        if (pageToKeep) {
          duplicatePages = sageStocksPages.filter((p: any) => p.id !== existingUser.sageStocksPageId);
          log(LogLevel.INFO, 'Using saved page ID from user record', {
            savedPageId: existingUser.sageStocksPageId,
            pageStillExists: true,
          });
        } else {
          // Saved page ID doesn't exist - fall back to oldest page
          log(LogLevel.WARN, 'Saved page ID not found in workspace - falling back to oldest page', {
            savedPageId: existingUser.sageStocksPageId,
            willUseOldestPage: true,
          });
        }
      }

      // Strategy 2: No saved page ID or saved page doesn't exist - keep oldest by creation timestamp
      if (!pageToKeep) {
        // Sort by creation time (oldest first)
        const sortedPages = [...sageStocksPages].sort((a: any, b: any) => {
          const timeA = new Date(a.created_time).getTime();
          const timeB = new Date(b.created_time).getTime();
          return timeA - timeB;
        });

        pageToKeep = sortedPages[0];
        duplicatePages = sortedPages.slice(1);

        log(LogLevel.INFO, 'Keeping oldest Sage Stocks page by creation timestamp', {
          keepingPageId: pageToKeep.id,
          keepingPageCreated: pageToKeep.created_time,
          duplicatesCount: duplicatePages.length,
          duplicateCreatedTimes: duplicatePages.map((p: any) => p.created_time),
        });
      }

      // Archive (not delete) duplicate pages for safety
      if (duplicatePages.length > 0) {
        log(LogLevel.INFO, 'Archiving duplicate Sage Stocks templates (reversible)', {
          keepingPageId: pageToKeep.id,
          keepingPageCreated: pageToKeep.created_time,
          archivingPageIds: duplicatePages.map((p: any) => p.id),
          duplicateCount: duplicatePages.length,
          reason: 're-authentication-cleanup',
          userId: existingUser.id,
          userEmail,
        });

        // Archive each duplicate
        for (const dupPage of duplicatePages) {
          try {
            await userNotion.pages.update({
              page_id: dupPage.id,
              archived: true,
            });

            log(LogLevel.INFO, 'Archived duplicate Sage Stocks page', {
              pageId: dupPage.id,
              createdTime: dupPage.created_time,
              keptPageId: pageToKeep.id,
              reversible: true,
            });
          } catch (archiveError) {
            log(LogLevel.ERROR, 'Failed to archive duplicate page', {
              pageId: dupPage.id,
              error: archiveError instanceof Error ? archiveError.message : String(archiveError),
              willRetryOnNextAuth: true,
            });
          }
        }

        // Audit log for tracking
        log(LogLevel.INFO, 'Duplicate cleanup audit summary', {
          action: 'archive_duplicates',
          userId: existingUser.id,
          userEmail,
          keptPage: {
            id: pageToKeep.id,
            created: pageToKeep.created_time,
            reason: existingUser.sageStocksPageId === pageToKeep.id ? 'saved_page_id' : 'oldest_by_timestamp',
          },
          archivedPages: duplicatePages.map((p: any) => ({
            id: p.id,
            created: p.created_time,
          })),
          totalArchived: duplicatePages.length,
          reversible: true,
        });
      }
    }

    // Case 2: State data indicated existing template, but a new page was created anyway
    // This catches the bug where session exists but template_id was wrongly included
    if (!existingUser && stateData?.hasExistingTemplate && sageStocksPages.length === 1) {
      log(LogLevel.ERROR, '🚨 WRONGLY CREATED TEMPLATE DETECTED: State data said user had template, but new one was created', {
        stateUserId: stateData.userId,
        stateNotionUserId: stateData.notionUserId,
        newPageId: sageStocksPages[0].id,
        newPageCreated: sageStocksPages[0].created_time,
        templateShouldNotHaveBeenDuplicated: true,
        willArchiveImmediately: true,
      });

      // Archive the wrongly created template
      try {
        await userNotion.pages.update({
          page_id: sageStocksPages[0].id,
          archived: true,
        });

        log(LogLevel.WARN, 'Archived wrongly created template', {
          pageId: sageStocksPages[0].id,
          reason: 'state_data_indicated_existing_template',
          userEmail,
        });

        // Clear the array so downstream logic doesn't use this page
        sageStocksPages = [];
      } catch (archiveError) {
        log(LogLevel.ERROR, 'Failed to archive wrongly created template', {
          pageId: sageStocksPages[0].id,
          error: archiveError instanceof Error ? archiveError.message : String(archiveError),
        });
      }
    }

    // Case 3: Database check - if existingUser has sageStocksPageId but a new template was just created
    if (existingUser && existingUser.sageStocksPageId && sageStocksPages.length === 1) {
      const foundPage = sageStocksPages[0];
      // Check if the found page is DIFFERENT from the saved one
      if (foundPage.id !== existingUser.sageStocksPageId) {
        log(LogLevel.ERROR, '🚨 DUPLICATE DETECTED: User has saved page ID, but found different Sage Stocks page', {
          userId: existingUser.id,
          email: userEmail,
          savedPageId: existingUser.sageStocksPageId,
          foundPageId: foundPage.id,
          foundPageCreated: foundPage.created_time,
          willArchiveNewPage: true,
        });

        // Archive the newly created duplicate
        try {
          await userNotion.pages.update({
            page_id: foundPage.id,
            archived: true,
          });

          log(LogLevel.WARN, 'Archived newly created duplicate (user already has saved page)', {
            archivedPageId: foundPage.id,
            keptPageId: existingUser.sageStocksPageId,
            userEmail,
          });

          // Clear the array so downstream logic uses the saved page from database
          sageStocksPages = [];
        } catch (archiveError) {
          log(LogLevel.ERROR, 'Failed to archive newly created duplicate', {
            pageId: foundPage.id,
            error: archiveError instanceof Error ? archiveError.message : String(archiveError),
          });
        }
      } else {
        log(LogLevel.INFO, 'Found page matches saved page ID - no duplicate', {
          pageId: foundPage.id,
          userEmail,
        });
      }
    }

    // Step 5: Create or update user in Beta Users database
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
      isExistingUser: !!existingUser,
    });

    // Auto-approve admin email
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail && userEmail.toLowerCase() === adminEmail.toLowerCase() && user.status !== 'approved') {
      log(LogLevel.INFO, 'Auto-approving admin user', { email: userEmail });
      await updateUserStatus(user.id, 'approved');
      user.status = 'approved'; // Update local copy
    }

    // Step 4: Create session for all users (pending, denied, approved)
    // This allows pending users to check if their status changes without re-authenticating
    await storeUserSession(res, {
      userId: user.id,
      email: user.email,
      name: user.name,
      notionUserId: user.notionUserId,
    });

    log(LogLevel.INFO, 'Session created', {
      email: userEmail,
      status: user.status,
    });

    // Step 5: Redirect based on approval status
    if (user.status === 'pending') {
      log(LogLevel.INFO, 'User pending approval', { email: userEmail });
      res.redirect('/?status=pending');
      return;
    }

    if (user.status === 'denied') {
      log(LogLevel.INFO, 'User access denied', { email: userEmail });
      res.redirect('/?status=denied');
      return;
    }

    // Step 6: User is approved - proceed with setup
    if (user.status === 'approved') {
      log(LogLevel.INFO, 'User approved, proceeding with setup', {
        email: userEmail,
      });

      // Check if setup is complete
      // TEMP: Commented out for testing - always go through setup flow
      // const setupComplete = Boolean(
      //   user.stockAnalysesDbId &&
      //   user.stockHistoryDbId &&
      //   user.sageStocksPageId
      // );

      // Redirect based on setup status
      // TEMP: Commented out auto-redirect for testing - always go through setup flow
      // if (setupComplete) {
      //   // Setup already complete - go to analyzer
      //   res.redirect('/analyze.html');
      // } else {
        // New user or incomplete setup - go to single-page setup flow (Step 2 = Duplicate Template)
        res.redirect('/?step=2'); // OAuth (step 1) just completed, now at step 2 (duplicate)
      // }
      return;
    }

    // Fallback (should never reach here)
    log(LogLevel.ERROR, 'Unexpected user status', { status: user.status });
    res.redirect('/?error=unknown_status');
  } catch (error) {
    log(LogLevel.ERROR, 'OAuth callback error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.redirect('/?error=oauth_failed');
  }
}
