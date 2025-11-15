/**
 * Database Validator
 *
 * Validates user database configuration before running analyses
 * Provides fail-fast error detection and detailed diagnostics
 */

import { Client } from '@notionhq/client';
import { log, LogLevel } from './logger';
import { reportDatabaseConfigError } from './bug-reporter';

export interface DatabaseConfig {
  stockAnalysesDbId: string;
  stockHistoryDbId: string;
  sageStocksPageId: string;
  userEmail: string;
  userId: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  details: ValidationDetails;
}

export interface ValidationError {
  field: 'stockAnalysesDbId' | 'stockHistoryDbId' | 'sageStocksPageId';
  code: 'NOT_FOUND' | 'NO_ACCESS' | 'INVALID_TYPE' | 'MISSING';
  message: string;
  helpUrl?: string;
}

export interface ValidationWarning {
  field: string;
  code: 'DUPLICATES_FOUND' | 'OLD_VERSION';
  message: string;
}

export interface ValidationDetails {
  stockAnalysesDb?: {
    accessible: boolean;
    title?: string;
    createdTime?: string;
  };
  stockHistoryDb?: {
    accessible: boolean;
    title?: string;
    createdTime?: string;
  };
  sageStocksPage?: {
    accessible: boolean;
    title?: string;
    createdTime?: string;
  };
  duplicatesFound?: {
    stockAnalysesDbs: number;
    stockHistoryDbs: number;
    sageStocksPages: number;
  };
}

/**
 * Validate database configuration
 * Checks if all configured databases are accessible
 */
export async function validateDatabaseConfig(
  notionToken: string,
  config: DatabaseConfig
): Promise<ValidationResult> {
  const notion = new Client({ auth: notionToken, notionVersion: '2025-09-03' });
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const details: ValidationDetails = {};

  log(LogLevel.INFO, 'Validating database configuration', {
    userId: config.userId,
    email: config.userEmail,
  });

  // Validate Stock Analyses Database
  try {
    const db = await notion.databases.retrieve({
      database_id: config.stockAnalysesDbId,
    });
    details.stockAnalysesDb = {
      accessible: true,
      title: (db as any).title?.[0]?.plain_text || 'Untitled',
      createdTime: (db as any).created_time,
    };
    log(LogLevel.INFO, 'Stock Analyses DB accessible', {
      dbId: config.stockAnalysesDbId,
      title: details.stockAnalysesDb.title,
    });
  } catch (error: any) {
    const errorCode = getErrorCode(error);
    errors.push({
      field: 'stockAnalysesDbId',
      code: errorCode,
      message: `Stock Analyses database not accessible: ${error.message}`,
      helpUrl: 'https://sagestocks.vercel.app/setup',
    });
    details.stockAnalysesDb = { accessible: false };
    log(LogLevel.ERROR, 'Stock Analyses DB validation failed', {
      dbId: config.stockAnalysesDbId,
      error: error.message,
      code: errorCode,
    });
  }

  // Validate Stock History Database
  try {
    const db = await notion.databases.retrieve({
      database_id: config.stockHistoryDbId,
    });
    details.stockHistoryDb = {
      accessible: true,
      title: (db as any).title?.[0]?.plain_text || 'Untitled',
      createdTime: (db as any).created_time,
    };
    log(LogLevel.INFO, 'Stock History DB accessible', {
      dbId: config.stockHistoryDbId,
      title: details.stockHistoryDb.title,
    });
  } catch (error: any) {
    const errorCode = getErrorCode(error);
    errors.push({
      field: 'stockHistoryDbId',
      code: errorCode,
      message: `Stock History database not accessible: ${error.message}`,
      helpUrl: 'https://sagestocks.vercel.app/setup',
    });
    details.stockHistoryDb = { accessible: false };
    log(LogLevel.ERROR, 'Stock History DB validation failed', {
      dbId: config.stockHistoryDbId,
      error: error.message,
      code: errorCode,
    });
  }

  // Validate Sage Stocks Page
  try {
    const page = await notion.pages.retrieve({
      page_id: config.sageStocksPageId,
    });
    const pageTitle = (page as any).properties?.title?.title?.[0]?.plain_text || 'Untitled';
    details.sageStocksPage = {
      accessible: true,
      title: pageTitle,
      createdTime: (page as any).created_time,
    };
    log(LogLevel.INFO, 'Sage Stocks Page accessible', {
      pageId: config.sageStocksPageId,
      title: details.sageStocksPage.title,
    });
  } catch (error: any) {
    const errorCode = getErrorCode(error);
    errors.push({
      field: 'sageStocksPageId',
      code: errorCode,
      message: `Sage Stocks page not accessible: ${error.message}`,
      helpUrl: 'https://sagestocks.vercel.app/setup',
    });
    details.sageStocksPage = { accessible: false };
    log(LogLevel.ERROR, 'Sage Stocks Page validation failed', {
      pageId: config.sageStocksPageId,
      error: error.message,
      code: errorCode,
    });
  }

  // Check for duplicates in workspace (warning, not error)
  try {
    const duplicates = await checkForDuplicates(notion);
    if (duplicates.stockAnalysesDbs > 1 || duplicates.stockHistoryDbs > 1) {
      warnings.push({
        field: 'general',
        code: 'DUPLICATES_FOUND',
        message: `Found ${duplicates.stockAnalysesDbs} Stock Analyses DBs and ${duplicates.stockHistoryDbs} Stock History DBs. Consider cleaning up duplicates.`,
      });
      details.duplicatesFound = duplicates;
    }
  } catch (error) {
    // Ignore duplicate check errors
    log(LogLevel.WARN, 'Failed to check for duplicates', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const valid = errors.length === 0;

  // Report critical errors to Bug Reports database
  if (!valid) {
    await reportDatabaseConfigError(
      `Database validation failed for ${config.userEmail}`,
      {
        userEmail: config.userEmail,
        userId: config.userId,
        configuredDbIds: {
          stockAnalysesDbId: config.stockAnalysesDbId,
          stockHistoryDbId: config.stockHistoryDbId,
          sageStocksPageId: config.sageStocksPageId,
        },
        source: 'database-validator',
      }
    ).catch((err) => {
      log(LogLevel.ERROR, 'Failed to report database validation error', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return {
    valid,
    errors,
    warnings,
    details,
  };
}

/**
 * Check for duplicate databases in workspace
 */
async function checkForDuplicates(notion: Client): Promise<{
  stockAnalysesDbs: number;
  stockHistoryDbs: number;
  sageStocksPages: number;
}> {
  const databasesResponse = await notion.search({
    filter: { property: 'object', value: 'database' },
    page_size: 100,
  });

  const pagesResponse = await notion.search({
    filter: { property: 'object', value: 'page' },
    page_size: 100,
  });

  const stockAnalysesDbs = databasesResponse.results.filter((db: any) => {
    const title = db.title?.[0]?.plain_text || '';
    return title.toLowerCase().includes('stock analyses');
  });

  const stockHistoryDbs = databasesResponse.results.filter((db: any) => {
    const title = db.title?.[0]?.plain_text || '';
    return title.toLowerCase().includes('stock history');
  });

  const sageStocksPages = pagesResponse.results.filter((page: any) => {
    const title = page.properties?.title?.title?.[0]?.plain_text || '';
    return title.toLowerCase().includes('sage stocks');
  });

  return {
    stockAnalysesDbs: stockAnalysesDbs.length,
    stockHistoryDbs: stockHistoryDbs.length,
    sageStocksPages: sageStocksPages.length,
  };
}

/**
 * Get error code from Notion API error
 */
function getErrorCode(error: any): ValidationError['code'] {
  if (error.code === 'object_not_found') {
    return 'NOT_FOUND';
  } else if (error.code === 'unauthorized' || error.code === 'restricted_resource') {
    return 'NO_ACCESS';
  } else if (error.code === 'validation_error') {
    return 'INVALID_TYPE';
  }
  return 'NOT_FOUND'; // Default
}

/**
 * Quick validation check - throws error if invalid
 */
export async function assertDatabasesValid(
  notionToken: string,
  config: DatabaseConfig
): Promise<void> {
  const result = await validateDatabaseConfig(notionToken, config);

  if (!result.valid) {
    const errorMessages = result.errors.map((e) => `  - ${e.field}: ${e.message}`).join('\n');
    throw new Error(
      `Database configuration invalid:\n${errorMessages}\n\nPlease re-run setup at https://sagestocks.vercel.app/setup`
    );
  }

  // Log warnings but don't fail
  if (result.warnings.length > 0) {
    result.warnings.forEach((w) => {
      log(LogLevel.WARN, w.message, { field: w.field, code: w.code });
    });
  }
}
