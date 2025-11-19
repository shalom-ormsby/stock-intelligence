/**
 * Email Verification Endpoint
 *
 * Checks if an email exists in the Beta Users database and whether
 * the user already has a Sage Stocks template set up.
 *
 * v1.2.11: Email-based existing user detection for sessionless re-authentication
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { log, LogLevel } from '../../lib/logger';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const { email } = req.query;

    if (!email || typeof email !== 'string') {
      log(LogLevel.WARN, 'Email verification request missing email parameter');
      res.status(400).json({
        success: false,
        error: 'Email parameter required',
      });
      return;
    }

    // Normalize email to lowercase for consistent lookups
    const normalizedEmail = email.toLowerCase().trim();

    log(LogLevel.INFO, 'Email verification request', {
      email: normalizedEmail,
    });

    // Look up user by email in Beta Users database
    const { getUserByEmail } = await import('../../lib/auth');
    const existingUser = await getUserByEmail(normalizedEmail);

    if (existingUser) {
      const hasExistingTemplate = !!(existingUser.sageStocksPageId);

      log(LogLevel.INFO, 'Email found in Beta Users database', {
        email: normalizedEmail,
        userId: existingUser.id,
        notionUserId: existingUser.notionUserId,
        hasSageStocksPageId: hasExistingTemplate,
        sageStocksPageId: existingUser.sageStocksPageId,
        status: existingUser.status,
      });

      res.status(200).json({
        success: true,
        exists: true,
        hasTemplate: hasExistingTemplate,
        status: existingUser.status,
      });
    } else {
      log(LogLevel.INFO, 'Email not found in Beta Users database (new user)', {
        email: normalizedEmail,
      });

      res.status(200).json({
        success: true,
        exists: false,
        hasTemplate: false,
      });
    }
  } catch (error) {
    log(LogLevel.ERROR, 'Email verification endpoint error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}
