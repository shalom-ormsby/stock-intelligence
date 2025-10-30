/**
 * Health Check Endpoint
 *
 * Public endpoint to verify API is accessible and operational.
 * Does not require authentication.
 *
 * Usage:
 * - GET /api/health
 * - Returns API status, version, and available endpoints
 *
 * v1.0 - Vercel Serverless + TypeScript
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { isAuthEnabled } from '../lib/auth';

interface HealthResponse {
  status: 'ok' | 'error';
  version: string;
  timestamp: string;
  environment: string;
  auth: {
    enabled: boolean;
    method: string;
  };
  endpoints: {
    path: string;
    method: string;
    description: string;
    requiresAuth: boolean;
  }[];
  config: {
    timeouts: {
      analyze: number;
      webhook: number;
      default: number;
    };
  };
}

/**
 * Health check handler
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only accept GET requests
  if (req.method !== 'GET') {
    res.status(405).json({
      status: 'error',
      error: 'Method not allowed',
      details: 'Only GET requests are accepted',
    });
    return;
  }

  try {
    const authEnabled = isAuthEnabled();

    const response: HealthResponse = {
      status: 'ok',
      version: '1.0.0-beta.1',
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL_ENV || 'development',
      auth: {
        enabled: authEnabled,
        method: authEnabled ? 'X-API-Key or Bearer token' : 'none',
      },
      endpoints: [
        {
          path: '/api/health',
          method: 'GET',
          description: 'Health check and API information',
          requiresAuth: false,
        },
        {
          path: '/api/analyze',
          method: 'POST',
          description: 'Analyze a stock and sync to Notion',
          requiresAuth: authEnabled,
        },
        {
          path: '/api/webhook',
          method: 'POST',
          description: 'Notion webhook handler for analysis triggers and archiving',
          requiresAuth: authEnabled,
        },
      ],
      config: {
        timeouts: {
          analyze: 300, // 5 minutes
          webhook: 60, // 1 minute
          default: 30, // 30 seconds
        },
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Health check error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    res.status(500).json({
      status: 'error',
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
  }
}
