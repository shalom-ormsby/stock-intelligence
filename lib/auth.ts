/**
 * API Authentication Middleware
 *
 * Provides optional API key authentication for public endpoints.
 *
 * Usage:
 * 1. Set API_KEY environment variable in Vercel
 * 2. If set, clients must include X-API-Key header
 * 3. If not set, endpoints are publicly accessible without auth
 *
 * v1.0 - Vercel Serverless + TypeScript
 */

import { VercelRequest, VercelResponse } from '@vercel/node';

export interface AuthError {
  success: false;
  error: string;
  details: string;
}

/**
 * Validate API key from request headers
 *
 * @param req - Vercel request object
 * @returns true if authenticated or auth disabled, false otherwise
 */
export function validateApiKey(req: VercelRequest): boolean {
  const apiKey = process.env.API_KEY;

  // If no API key is configured, allow all requests (development mode)
  if (!apiKey) {
    return true;
  }

  // Check for API key in headers (X-API-Key or Authorization: Bearer <key>)
  const headerApiKey = req.headers['x-api-key'] as string;
  const authHeader = req.headers['authorization'] as string;
  const bearerToken = authHeader?.replace('Bearer ', '');

  // Validate API key
  return headerApiKey === apiKey || bearerToken === apiKey;
}

/**
 * Middleware to require API key authentication
 * Returns true if request should continue, false if unauthorized response sent
 *
 * @param req - Vercel request object
 * @param res - Vercel response object
 * @returns true if authenticated, false if unauthorized
 */
export function requireAuth(
  req: VercelRequest,
  res: VercelResponse
): boolean {
  if (!validateApiKey(req)) {
    const errorResponse: AuthError = {
      success: false,
      error: 'Unauthorized',
      details: 'Valid API key required. Include X-API-Key header or Authorization: Bearer <key>',
    };

    res.status(401).json(errorResponse);
    return false;
  }

  return true;
}

/**
 * Check if API key authentication is enabled
 *
 * @returns true if API_KEY env var is set
 */
export function isAuthEnabled(): boolean {
  return !!process.env.API_KEY;
}
