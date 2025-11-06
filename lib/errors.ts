/**
 * Custom Error Classes for Stock Intelligence v1.0.3
 *
 * Provides user-friendly error messages and structured error codes
 * for all failure scenarios in the stock analysis system.
 *
 * Error Hierarchy:
 * - StockIntelligenceError (base class)
 *   - APITimeoutError
 *   - APIRateLimitError
 *   - DataNotFoundError
 *   - InvalidTickerError
 *   - NotionAPIError
 *   - ValidationError
 *   - InsufficientDataError
 *   - RateLimitError (user-level rate limiting, timezone-aware)
 *   - APIResponseError
 *
 * v1.0.3 Changes:
 * - RateLimitError now accepts timezone parameter for proper reset time formatting
 */

import { formatResetTime, validateTimezone, getTimezoneFromEnv, type SupportedTimezone } from './timezone';

/**
 * Base error class for all Stock Intelligence errors
 *
 * Provides standardized error structure with:
 * - Developer message (for logs)
 * - User message (for display in Notion)
 * - Error code (for debugging/monitoring)
 * - HTTP status code (for API responses)
 */
export class StockIntelligenceError extends Error {
  constructor(
    message: string,
    public code: string,
    public userMessage: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Format error for JSON response
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.userMessage,
      statusCode: this.statusCode,
    };
  }
}

/**
 * API Timeout Error
 *
 * Thrown when external API call exceeds timeout threshold.
 * Common causes: Network issues, API service degradation
 */
export class APITimeoutError extends StockIntelligenceError {
  constructor(service: string, timeout: number) {
    super(
      `${service} API timeout after ${timeout}ms`,
      'API_TIMEOUT',
      `🤨 This is taking longer than usual\n\nOur data provider is running slow right now. Try again in a couple minutes?`,
      504
    );
  }
}

/**
 * API Rate Limit Error
 *
 * Thrown when external API rate limit is exceeded.
 * Common causes: Too many requests in short period
 */
export class APIRateLimitError extends StockIntelligenceError {
  constructor(service: string, retryAfter?: number) {
    const retryMessage = retryAfter
      ? ` Please wait ${retryAfter} seconds before trying again.`
      : ' Please wait a moment and try again.';

    super(
      `${service} API rate limit exceeded`,
      'RATE_LIMIT',
      `Too many requests to ${service}.${retryMessage}`,
      429
    );
  }
}

/**
 * Data Not Found Error
 *
 * Thrown when required data is completely missing for a ticker.
 * Common causes: Invalid ticker, delisted stock, API data gap
 */
export class DataNotFoundError extends StockIntelligenceError {
  constructor(ticker: string, dataType: string) {
    super(
      `${dataType} data not found for ${ticker}`,
      'DATA_NOT_FOUND',
      `¯\\_(ツ)_/¯ Missing some data for ${ticker}\n\nWe couldn't find complete ${dataType}. Could be a smaller stock with limited data, or the info's temporarily unavailable.\n\nYou can still run the analysis, but heads up—it might be incomplete.`,
      404
    );
  }
}

/**
 * Invalid Ticker Error
 *
 * Thrown when ticker symbol fails validation.
 * Common causes: Typo, non-existent symbol, special characters
 */
export class InvalidTickerError extends StockIntelligenceError {
  constructor(ticker: string, reason?: string) {
    const details = reason ? ` (${reason})` : '';
    super(
      `Invalid ticker symbol: ${ticker}${details}`,
      'INVALID_TICKER',
      `🤔 Can't find "${ticker}"\n\nDouble-check the ticker symbol. Stock symbols are usually 3-5 letters (like NVDA or MSFT).`,
      400
    );
  }
}

/**
 * Notion API Error
 *
 * Thrown when Notion API operations fail.
 * Common causes: Network issues, invalid properties, rate limits
 */
export class NotionAPIError extends StockIntelligenceError {
  constructor(operation: string, details: string) {
    super(
      `Notion API error during ${operation}: ${details}`,
      'NOTION_API_ERROR',
      `🤦‍♂️ Couldn't save to Notion\n\nSomething went wrong on our end. The analysis finished, but we couldn't write it to Notion.\n\nTry again? 🤞`,
      500
    );
  }
}

/**
 * Validation Error
 *
 * Thrown when input validation fails.
 * Common causes: Missing required fields, invalid data format
 */
export class ValidationError extends StockIntelligenceError {
  constructor(field: string, issue: string) {
    super(
      `Validation failed for ${field}: ${issue}`,
      'VALIDATION_ERROR',
      `Invalid ${field}: ${issue}`,
      400
    );
  }
}

/**
 * Insufficient Data Error
 *
 * Thrown when critical data fields are missing, preventing analysis.
 * Different from DataNotFoundError - this is for partial data issues.
 */
export class InsufficientDataError extends StockIntelligenceError {
  constructor(ticker: string, missingFields: string[]) {
    const fieldList = missingFields.join(', ');
    super(
      `Insufficient data for ${ticker}: missing ${fieldList}`,
      'INSUFFICIENT_DATA',
      `Cannot complete analysis for ${ticker}. Critical data is missing: ${fieldList}. This may be a temporary API issue.`,
      422
    );
  }
}

/**
 * Rate Limit Error (User-Level, Timezone-Aware)
 *
 * Thrown when user exceeds their daily analysis quota.
 * Different from APIRateLimitError - this is for our application's user-level limits.
 *
 * v1.0.3: Now accepts timezone parameter to show reset time in user's timezone
 */
export class RateLimitError extends StockIntelligenceError {
  public readonly resetAt: Date;
  public readonly timezone: SupportedTimezone;

  constructor(resetAt: Date, timezone?: string, _remaining: number = 0) {
    // Validate and normalize timezone
    const userTimezone = validateTimezone(timezone, getTimezoneFromEnv());

    // Format reset time in user's timezone with abbreviation
    const resetTime = formatResetTime(resetAt, userTimezone);

    super(
      `User rate limit exceeded - limit will reset at ${resetTime}`,
      'USER_RATE_LIMIT_EXCEEDED',
      `💪 Superuser alert! 🤩\n\nYou just hit our freebie limit (10 analyses a day on the house).\n\nWanna power up? View plans at https://shalomormsby.com/analyze/pricing to run more analyses per day.\n\n[Settings](https://stock-intelligence.vercel.app/settings.html)`,
      429
    );

    this.resetAt = resetAt;
    this.timezone = userTimezone;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.userMessage,
      statusCode: this.statusCode,
      resetAt: this.resetAt.toISOString(),
      timezone: this.timezone,
    };
  }
}

/**
 * API Response Error
 *
 * Thrown when external API returns an error response.
 * Captures HTTP status and API-specific error messages.
 */
export class APIResponseError extends StockIntelligenceError {
  constructor(
    service: string,
    status: number,
    message: string
  ) {
    let userMessage: string;
    let code: string;

    switch (status) {
      case 400:
        code = 'API_BAD_REQUEST';
        userMessage = `${service} rejected the request. The ticker or parameters may be invalid.`;
        break;
      case 401:
        code = 'API_UNAUTHORIZED';
        userMessage = `${service} authentication failed. This is a system configuration issue. Please contact support.`;
        break;
      case 403:
        code = 'API_FORBIDDEN';
        userMessage = `${service} access denied. Your subscription may have expired or reached limits.`;
        break;
      case 404:
        code = 'API_NOT_FOUND';
        userMessage = `${service} could not find the requested data. The ticker may not exist or may be delisted.`;
        break;
      case 429:
        code = 'API_RATE_LIMIT';
        userMessage = `${service} rate limit exceeded. Too many requests. Please wait and try again.`;
        break;
      case 500:
      case 502:
      case 503:
        code = 'API_SERVER_ERROR';
        userMessage = `${service} is experiencing technical difficulties. Please try again later.`;
        break;
      default:
        code = 'API_ERROR';
        userMessage = `${service} returned an error. Please try again.`;
    }

    super(
      `${service} API error (${status}): ${message}`,
      code,
      userMessage,
      status
    );
  }
}

/**
 * Check if an error is a Stock Intelligence error
 */
export function isStockIntelligenceError(
  error: unknown
): error is StockIntelligenceError {
  return error instanceof StockIntelligenceError;
}

/**
 * Get user-friendly error message from any error
 */
export function getUserMessage(error: unknown): string {
  if (isStockIntelligenceError(error)) {
    return error.userMessage;
  }

  if (error instanceof Error) {
    return 'An unexpected error occurred. Please try again or contact support if the problem persists.';
  }

  return 'An unknown error occurred. Please try again.';
}

/**
 * Get error code from any error
 */
export function getErrorCode(error: unknown): string {
  if (isStockIntelligenceError(error)) {
    return error.code;
  }

  return 'UNKNOWN_ERROR';
}

/**
 * Get HTTP status code from any error
 */
export function getStatusCode(error: unknown): number {
  if (isStockIntelligenceError(error)) {
    return error.statusCode;
  }

  return 500;
}
