/**
 * Setup Detection API Endpoint
 *
 * POST /api/setup/detect
 * Runs auto-detection for user's Notion template databases
 *
 * This is Step 3 in the setup flow and auto-runs after OAuth completes
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateSession, getUserByEmail, decryptToken, updateSetupProgress } from '../../lib/auth';
import { autoDetectTemplate } from '../../lib/template-detection';
import { log, LogLevel } from '../../lib/logger';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check authentication
    const session = await validateSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get user data
    const user = await getUserByEmail(session.email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already set up
    if (user.stockAnalysesDbId && user.stockHistoryDbId && user.sageStocksPageId) {
      return res.json({
        success: true,
        alreadySetup: true,
        detection: {
          stockAnalysesDb: { id: user.stockAnalysesDbId, title: 'Stock Analyses', confidence: 'high' },
          stockHistoryDb: { id: user.stockHistoryDbId, title: 'Stock History', confidence: 'high' },
          sageStocksPage: { id: user.sageStocksPageId, title: 'Sage Stocks', confidence: 'high' },
          needsManual: false,
        }
      });
    }

    log(LogLevel.INFO, 'Starting auto-detection', { userId: user.id, email: session.email });

    // Decrypt user's OAuth token
    const userToken = await decryptToken(user.accessToken);

    // Run auto-detection
    const detection = await autoDetectTemplate(userToken);

    log(LogLevel.INFO, 'Auto-detection complete', {
      userId: user.id,
      stockAnalyses: detection.stockAnalysesDb ? 'Found' : 'Not found',
      stockHistory: detection.stockHistoryDb ? 'Found' : 'Not found',
      sageStocksPage: detection.sageStocksPage ? 'Found' : 'Not found',
      needsManual: detection.needsManual,
    });

    // Update setup progress in session
    try {
      if (!detection.needsManual) {
        // Full auto-detection succeeded
        await updateSetupProgress(req, {
          currentStep: 3,
          completedSteps: [1, 2],
          step3DetectionResults: {
            stockAnalysesDb: detection.stockAnalysesDb || undefined,
            stockHistoryDb: detection.stockHistoryDb || undefined,
            sageStocksPage: detection.sageStocksPage || undefined,
          },
        });
      } else {
        // Partial detection - will need manual input
        await updateSetupProgress(req, {
          currentStep: 3,
          completedSteps: [1, 2],
          step3DetectionResults: {
            stockAnalysesDb: detection.stockAnalysesDb || undefined,
            stockHistoryDb: detection.stockHistoryDb || undefined,
            sageStocksPage: detection.sageStocksPage || undefined,
          },
          errors: [{
            step: 3,
            message: 'Could not auto-detect all databases. Please enter them manually.',
            code: 'PARTIAL_DETECTION',
          }],
        });
      }
    } catch (error) {
      console.warn('⚠️ Failed to update setup progress (non-critical):', error);
    }

    return res.json({
      success: true,
      detection: {
        stockAnalysesDb: detection.stockAnalysesDb,
        stockHistoryDb: detection.stockHistoryDb,
        sageStocksPage: detection.sageStocksPage,
        needsManual: detection.needsManual,
      },
    });
  } catch (error: any) {
    log(LogLevel.ERROR, 'Auto-detection error', {
      error: error.message,
      stack: error.stack,
    });

    // Mark error in setup progress
    try {
      await updateSetupProgress(req, {
        errors: [{
          step: 3,
          message: error.message || 'Auto-detection failed',
          code: 'DETECTION_ERROR',
        }],
      });
    } catch (updateError) {
      console.warn('⚠️ Failed to update setup progress with error (non-critical):', updateError);
    }

    return res.status(500).json({
      success: false,
      error: 'Auto-detection failed',
      details: error.message,
      needsManual: true,
    });
  }
}
