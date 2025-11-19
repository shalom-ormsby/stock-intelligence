/**
 * Delayed Duplicate Template Cleanup Endpoint
 *
 * Searches for duplicate Sage Stocks templates and archives them.
 * Called by frontend 15+ seconds after OAuth completes to catch
 * async duplicates that Notion creates after the callback finishes.
 *
 * v1.2.12: Fixes duplicate appearing 7+ minutes after OAuth despite
 * correct template_id skipping in authorize.ts
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { log, LogLevel } from '../../lib/logger';
import { validateSession, getUserByNotionId } from '../../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    // Validate session
    const session = await validateSession(req);
    if (!session) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Session required',
      });
      return;
    }

    log(LogLevel.INFO, 'Delayed duplicate cleanup requested', {
      userId: session.userId,
      notionUserId: session.notionUserId,
      email: session.email,
    });

    // Get user from database
    const user = await getUserByNotionId(session.notionUserId);
    if (!user) {
      log(LogLevel.ERROR, 'User not found in database', {
        notionUserId: session.notionUserId,
      });
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    if (!user.accessToken) {
      log(LogLevel.ERROR, 'User has no access token', {
        userId: user.id,
        email: user.email,
      });
      res.status(400).json({
        success: false,
        error: 'No access token available',
      });
      return;
    }

    // Decrypt access token
    const { decryptToken } = await import('../../lib/auth');
    const accessToken = await decryptToken(user.accessToken);

    // Initialize Notion client
    const { Client } = await import('@notionhq/client');
    const notion = new Client({ auth: accessToken, notionVersion: '2025-09-03' });

    // Search for ALL Sage Stocks pages
    log(LogLevel.INFO, 'Searching for Sage Stocks templates (delayed cleanup)', {
      userId: user.id,
      email: user.email,
      hasSavedPageId: !!user.sageStocksPageId,
      savedPageId: user.sageStocksPageId,
    });

    const searchResults = await notion.search({
      filter: { property: 'object', value: 'page' },
      page_size: 100,
    });

    const sageStocksPages = searchResults.results.filter((p: any) =>
      p.object === 'page' &&
      p.properties?.title?.title?.[0]?.plain_text?.includes('Sage Stocks')
    );

    log(LogLevel.WARN, 'Delayed template search complete', {
      totalPagesAccessible: searchResults.results.length,
      sageStocksFoundCount: sageStocksPages.length,
      sageStocksIds: sageStocksPages.map((p: any) => p.id),
      sageStocksCreatedTimes: sageStocksPages.map((p: any) => ({
        id: p.id,
        created: (p as any).created_time,
      })),
      userHasSavedPageId: !!user.sageStocksPageId,
      savedPageId: user.sageStocksPageId,
    });

    // Track cleanup results
    let duplicatesFound = 0;
    let duplicatesArchived = 0;
    const archivedPageIds: string[] = [];

    // CASE 1: Multiple templates found (clear duplicate scenario)
    if (sageStocksPages.length > 1) {
      log(LogLevel.ERROR, '🚨 DELAYED CLEANUP: Multiple Sage Stocks templates detected', {
        userId: user.id,
        email: user.email,
        foundCount: sageStocksPages.length,
        savedPageId: user.sageStocksPageId,
        pageIds: sageStocksPages.map((p: any) => p.id),
      });

      duplicatesFound = sageStocksPages.length - 1;

      // Determine which page to keep
      let pageToKeep: any = null;
      let duplicatePages: any[] = [];

      // Strategy 1: Keep the page matching saved ID (if exists)
      if (user.sageStocksPageId) {
        pageToKeep = sageStocksPages.find((p: any) => p.id === user.sageStocksPageId);

        if (pageToKeep) {
          duplicatePages = sageStocksPages.filter((p: any) => p.id !== user.sageStocksPageId);
          log(LogLevel.INFO, 'Keeping page matching saved ID', {
            savedPageId: user.sageStocksPageId,
            duplicateCount: duplicatePages.length,
          });
        } else {
          log(LogLevel.WARN, 'Saved page ID not found - falling back to oldest page', {
            savedPageId: user.sageStocksPageId,
          });
        }
      }

      // Strategy 2: No saved page or saved page doesn't exist - keep oldest
      if (!pageToKeep) {
        const sortedPages = [...sageStocksPages].sort((a: any, b: any) => {
          const timeA = new Date(a.created_time).getTime();
          const timeB = new Date(b.created_time).getTime();
          return timeA - timeB;
        });

        pageToKeep = sortedPages[0];
        duplicatePages = sortedPages.slice(1);

        log(LogLevel.INFO, 'Keeping oldest page by timestamp', {
          keepingPageId: pageToKeep.id,
          keepingPageCreated: pageToKeep.created_time,
          duplicateCount: duplicatePages.length,
        });
      }

      // Archive duplicates
      for (const dupPage of duplicatePages) {
        try {
          await notion.pages.update({
            page_id: dupPage.id,
            archived: true,
          });

          duplicatesArchived++;
          archivedPageIds.push(dupPage.id);

          log(LogLevel.WARN, 'Archived duplicate Sage Stocks page (delayed cleanup)', {
            pageId: dupPage.id,
            createdTime: dupPage.created_time,
            keptPageId: pageToKeep.id,
            reason: 'delayed_duplicate_detection',
          });
        } catch (archiveError) {
          log(LogLevel.ERROR, 'Failed to archive duplicate (delayed cleanup)', {
            pageId: dupPage.id,
            error: archiveError instanceof Error ? archiveError.message : String(archiveError),
          });
        }
      }
    }

    // CASE 2: Single page found, but it's different from saved page ID
    else if (sageStocksPages.length === 1 && user.sageStocksPageId) {
      const foundPage = sageStocksPages[0];

      if (foundPage.id !== user.sageStocksPageId) {
        log(LogLevel.ERROR, '🚨 DELAYED CLEANUP: Found different page than saved ID', {
          userId: user.id,
          email: user.email,
          savedPageId: user.sageStocksPageId,
          foundPageId: foundPage.id,
          foundPageCreated: (foundPage as any).created_time,
          willArchiveFoundPage: true,
        });

        duplicatesFound = 1;

        // Archive the new duplicate (keep the saved page)
        try {
          await notion.pages.update({
            page_id: foundPage.id,
            archived: true,
          });

          duplicatesArchived++;
          archivedPageIds.push(foundPage.id);

          log(LogLevel.WARN, 'Archived wrongly created page (delayed cleanup)', {
            archivedPageId: foundPage.id,
            keptPageId: user.sageStocksPageId,
            reason: 'saved_page_id_mismatch',
          });
        } catch (archiveError) {
          log(LogLevel.ERROR, 'Failed to archive wrongly created page (delayed cleanup)', {
            pageId: foundPage.id,
            error: archiveError instanceof Error ? archiveError.message : String(archiveError),
          });
        }
      } else {
        log(LogLevel.INFO, 'Delayed cleanup: Found page matches saved ID - no duplicate', {
          pageId: foundPage.id,
          email: user.email,
        });
      }
    }

    // CASE 3: No duplicates found
    else {
      log(LogLevel.INFO, 'Delayed cleanup: No duplicates detected', {
        userId: user.id,
        email: user.email,
        sageStocksFoundCount: sageStocksPages.length,
        hasSavedPageId: !!user.sageStocksPageId,
      });
    }

    // Return cleanup results
    res.status(200).json({
      success: true,
      duplicatesFound,
      duplicatesArchived,
      archivedPageIds,
      message:
        duplicatesArchived > 0
          ? `Cleaned up ${duplicatesArchived} duplicate template(s)`
          : 'No duplicates found',
    });
  } catch (error) {
    log(LogLevel.ERROR, 'Delayed duplicate cleanup error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      success: false,
      error: 'Cleanup failed',
      message: 'An error occurred during duplicate cleanup',
    });
  }
}
