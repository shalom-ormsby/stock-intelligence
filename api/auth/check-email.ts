/**
 * Email Check Endpoint
 *
 * Checks if a user exists in the Beta Users database and if they have a template.
 * This runs BEFORE OAuth to determine the correct user flow:
 * - Existing user with template: Go straight to OAuth
 * - New user / No template: Show manual template setup first
 *
 * v1.2.14: Pre-OAuth database check
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { log, LogLevel } from '../../lib/logger';
import { getUserByEmail } from '../../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const { email } = req.query;

    if (!email || typeof email !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Email parameter required',
      });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    log(LogLevel.INFO, 'Email check requested (pre-OAuth)', {
      email: normalizedEmail,
    });

    // Check if user exists in Beta Users database
    const existingUser = await getUserByEmail(normalizedEmail);

    if (!existingUser) {
      log(LogLevel.INFO, 'User not found in database', {
        email: normalizedEmail,
      });
      res.status(200).json({
        success: true,
        exists: false,
        hasTemplate: false,
      });
      return;
    }

    // User exists - check if they have a template set up
    const hasTemplate = Boolean(existingUser.sageStocksPageId);

    log(LogLevel.INFO, 'User found in database', {
      email: normalizedEmail,
      userId: existingUser.id,
      notionUserId: existingUser.notionUserId,
      hasTemplate,
      sageStocksPageId: existingUser.sageStocksPageId,
    });

    res.status(200).json({
      success: true,
      exists: true,
      hasTemplate,
      userId: existingUser.id,
      notionUserId: existingUser.notionUserId,
    });
  } catch (error) {
    log(LogLevel.ERROR, 'Email check error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to check email',
    });
  }
}
