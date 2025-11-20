/**
 * Template Detection System
 *
 * Automatically detects user's Sage Stocks template databases and pages
 * using a scoring algorithm that matches against expected properties and titles.
 */

import { Client } from '@notionhq/client';

export interface DatabaseMatch {
  id: string;
  title: string;
  score: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface PageMatch {
  id: string;
  title: string;
  url: string;
  score: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface DetectionResult {
  stockAnalysesDb: DatabaseMatch | null;
  stockHistoryDb: DatabaseMatch | null;
  stockEventsDb: DatabaseMatch | null;
  marketContextDb: DatabaseMatch | null;
  sageStocksPage: PageMatch | null;
  needsManual: boolean;
}

interface MatchCriteria {
  titleMatches: string[];
  titleWeight: number;
  requiredProps: string[];
  requiredPropsWeight: number;
  optionalProps: string[];
  optionalPropsWeight: number;
  propertyTypes: Record<string, string>;
}

/**
 * Search for all databases in user's workspace
 */
async function searchUserDatabases(notionToken: string): Promise<any[]> {
  const notion = new Client({ auth: notionToken, notionVersion: '2025-09-03' });
  const databases: any[] = [];

  let hasMore = true;
  let startCursor: string | undefined = undefined;

  console.log('🔍 [searchUserDatabases] Starting database search...');
  console.log('🔍 [searchUserDatabases] API version: 2025-09-03');
  console.log('🔍 [searchUserDatabases] Filter: { property: "object", value: "database" }');

  while (hasMore) {
    const response = await notion.search({
      filter: { property: 'object', value: 'database' },
      start_cursor: startCursor,
      page_size: 100,
    });

    console.log(`📊 [searchUserDatabases] Batch ${databases.length / 100 + 1}: Found ${response.results.length} databases`);
    console.log(`📊 [searchUserDatabases] Response object types:`, response.results.map(r => r.object));
    databases.push(...response.results);
    hasMore = response.has_more;
    startCursor = response.next_cursor || undefined;
  }

  console.log(`✅ [searchUserDatabases] Search complete: ${databases.length} total databases found`);

  if (databases.length === 0) {
    console.log('⚠️  [searchUserDatabases] NO DATABASES FOUND!');
    console.log('⚠️  [searchUserDatabases] This could mean:');
    console.log('   1. Template hasn\'t been duplicated yet');
    console.log('   2. OAuth token lacks database permissions');
    console.log('   3. API version or filter is incorrect');
  } else {
    console.log('📋 [searchUserDatabases] Database details:');
    databases.forEach((db, index) => {
      console.log(`   ${index + 1}. "${db.title?.[0]?.plain_text || 'Untitled'}" (ID: ${db.id})`);
      console.log(`      Properties: ${Object.keys(db.properties || {}).join(', ')}`);
      console.log(`      Object type: ${db.object}`);
    });
  }

  return databases;
}

/**
 * Search for pages with Template Version property
 */
async function searchUserPages(notionToken: string): Promise<any[]> {
  const notion = new Client({ auth: notionToken, notionVersion: '2025-09-03' });
  const pages: any[] = [];

  let hasMore = true;
  let startCursor: string | undefined = undefined;

  console.log('🔍 [searchUserPages] Starting page search...');
  console.log('🔍 [searchUserPages] API version: 2025-09-03');
  console.log('🔍 [searchUserPages] Filter: { property: "object", value: "page" }');

  while (hasMore) {
    const response = await notion.search({
      filter: { property: 'object', value: 'page' },
      start_cursor: startCursor,
      page_size: 100,
    });

    console.log(`📄 [searchUserPages] Batch ${pages.length / 100 + 1}: Found ${response.results.length} pages`);
    pages.push(...response.results);
    hasMore = response.has_more;
    startCursor = response.next_cursor || undefined;
  }

  console.log(`✅ [searchUserPages] Search complete: ${pages.length} total pages found`);

  if (pages.length === 0) {
    console.log('⚠️  [searchUserPages] NO PAGES FOUND!');
    console.log('⚠️  [searchUserPages] This could mean:');
    console.log('   1. Template hasn\'t been duplicated yet');
    console.log('   2. OAuth token lacks page read permissions');
  } else {
    console.log('📋 [searchUserPages] Page details:');
    pages.forEach((page, index) => {
      const titleProp = Object.values(page.properties || {}).find(
        (prop: any) => prop.type === 'title'
      ) as any;
      const title = titleProp?.title?.[0]?.plain_text || 'Untitled';
      console.log(`   ${index + 1}. "${title}" (ID: ${page.id})`);
      console.log(`      Object type: ${page.object}`);
    });
  }

  return pages;
}

/**
 * Calculate match score for a database against criteria
 */
function calculateMatchScore(db: any, criteria: MatchCriteria): number {
  let score = 0;

  // Get database title
  const title = db.title?.[0]?.plain_text || '';

  // Title matching
  const titleMatch = criteria.titleMatches.some(t =>
    title.toLowerCase().includes(t.toLowerCase())
  );
  if (titleMatch) score += criteria.titleWeight;

  // Get property names
  const props = Object.keys(db.properties || {});

  // Required properties (all must exist)
  const hasAllRequired = criteria.requiredProps.every(requiredProp =>
    props.some(dbProp => dbProp.toLowerCase() === requiredProp.toLowerCase())
  );
  if (hasAllRequired) {
    score += criteria.requiredPropsWeight;
  } else {
    // If missing required properties, this is probably not the right database
    return 0;
  }

  // Optional properties (proportional score)
  const optionalMatches = criteria.optionalProps.filter(optProp =>
    props.some(dbProp => dbProp.toLowerCase() === optProp.toLowerCase())
  ).length;

  if (criteria.optionalProps.length > 0) {
    score += (optionalMatches / criteria.optionalProps.length) * criteria.optionalPropsWeight;
  }

  // Property types (bonus for correct types)
  for (const [propName, expectedType] of Object.entries(criteria.propertyTypes)) {
    const dbProp = Object.entries(db.properties || {}).find(
      ([name]) => name.toLowerCase() === propName.toLowerCase()
    );
    if (dbProp && (dbProp[1] as any).type === expectedType) {
      score += 0.05; // Small bonus for correct types
    }
  }

  return Math.min(score, 1.0); // Cap at 1.0
}

/**
 * Detect Stock Analyses database
 */
async function detectStockAnalysesDb(
  notionToken: string
): Promise<DatabaseMatch | null> {
  console.log('🎯 [detectStockAnalysesDb] Starting Stock Analyses detection...');
  const databases = await searchUserDatabases(notionToken);

  const criteria = {
    titleMatches: ['Stock Analyses', 'Analyses', 'Stock Analysis'],
    titleWeight: 0.3,
    requiredProps: ['Ticker', 'Composite Score', 'Recommendation'],
    requiredPropsWeight: 0.5,
    optionalProps: ['Technical Score', 'Fundamental Score', 'Analysis Date', 'Current Price', 'Status'],
    optionalPropsWeight: 0.2,
    propertyTypes: {
      'Composite Score': 'number',
      'Recommendation': 'select',
      'Ticker': 'title',
    },
  };

  const scores = databases.map(db => {
    const title = db.title?.[0]?.plain_text || 'Untitled';
    const props = Object.keys(db.properties || {});
    const score = calculateMatchScore(db, criteria);

    console.log(`  📊 Scoring "${title}":`, {
      score: score.toFixed(3),
      properties: props,
      hasRequiredProps: criteria.requiredProps.every(req =>
        props.some(p => p.toLowerCase() === req.toLowerCase())
      ),
    });

    return {
      id: db.id,
      title,
      score,
    };
  });

  const best = scores.sort((a, b) => b.score - a.score)[0];

  console.log('🏆 [detectStockAnalysesDb] Best match:', best ? {
    title: best.title,
    score: best.score.toFixed(3),
    threshold: '0.5',
    passes: best.score >= 0.5,
  } : 'No matches');

  if (!best || best.score < 0.5) return null;

  return {
    ...best,
    confidence: best.score > 0.8 ? 'high' : best.score > 0.6 ? 'medium' : 'low',
  };
}

/**
 * Detect Stock History database
 */
async function detectStockHistoryDb(
  notionToken: string
): Promise<DatabaseMatch | null> {
  console.log('🎯 [detectStockHistoryDb] Starting Stock History detection...');
  const databases = await searchUserDatabases(notionToken);

  const criteria = {
    titleMatches: ['Stock History', 'History', 'Price History'],
    titleWeight: 0.3,
    requiredProps: ['Ticker', 'Analysis Date', 'Current Price'],
    requiredPropsWeight: 0.5,
    optionalProps: ['Technical Score', 'Composite Score', 'Volume', 'Recommendation'],
    optionalPropsWeight: 0.2,
    propertyTypes: {
      'Current Price': 'number',
      'Analysis Date': 'date',
    },
  };

  const scores = databases.map(db => {
    const title = db.title?.[0]?.plain_text || 'Untitled';
    const props = Object.keys(db.properties || {});
    const score = calculateMatchScore(db, criteria);

    console.log(`  📊 Scoring "${title}":`, {
      score: score.toFixed(3),
      properties: props,
      hasRequiredProps: criteria.requiredProps.every(req =>
        props.some(p => p.toLowerCase() === req.toLowerCase())
      ),
    });

    return {
      id: db.id,
      title,
      score,
    };
  });

  const best = scores.sort((a, b) => b.score - a.score)[0];

  console.log('🏆 [detectStockHistoryDb] Best match:', best ? {
    title: best.title,
    score: best.score.toFixed(3),
    threshold: '0.5',
    passes: best.score >= 0.5,
  } : 'No matches');

  if (!best || best.score < 0.5) return null;

  return {
    ...best,
    confidence: best.score > 0.8 ? 'high' : best.score > 0.6 ? 'medium' : 'low',
  };
}

/**
 * Detect Stock Events database (v1.2.16)
 */
async function detectStockEventsDb(
  notionToken: string
): Promise<DatabaseMatch | null> {
  console.log('🎯 [detectStockEventsDb] Starting Stock Events detection...');
  const databases = await searchUserDatabases(notionToken);

  const criteria = {
    titleMatches: ['Stock Events', 'Events', 'SI Events'],
    titleWeight: 0.3,
    requiredProps: ['Ticker', 'Event Type', 'When'],
    requiredPropsWeight: 0.5,
    optionalProps: ['Event Name', 'Timing'],
    optionalPropsWeight: 0.2,
    propertyTypes: {
      'Ticker': 'relation',
      'Event Type': 'select',
      'When': 'date',
    },
  };

  const scores = databases.map(db => {
    const title = db.title?.[0]?.plain_text || 'Untitled';
    const props = Object.keys(db.properties || {});
    const score = calculateMatchScore(db, criteria);

    console.log(`  📊 Scoring "${title}":`, {
      score: score.toFixed(3),
      properties: props,
      hasRequiredProps: criteria.requiredProps.every(req =>
        props.some(p => p.toLowerCase() === req.toLowerCase())
      ),
    });

    return {
      id: db.id,
      title,
      score,
    };
  });

  const best = scores.sort((a, b) => b.score - a.score)[0];

  console.log('🏆 [detectStockEventsDb] Best match:', best ? {
    title: best.title,
    score: best.score.toFixed(3),
    threshold: '0.5',
    passes: best.score >= 0.5,
  } : 'No matches');

  if (!best || best.score < 0.5) return null;

  return {
    ...best,
    confidence: best.score > 0.8 ? 'high' : best.score > 0.6 ? 'medium' : 'low',
  };
}

/**
 * Detect Market Context Database
 * Look for "Market Context" or "Market Regime" with specific properties
 */
async function detectMarketContextDb(notionToken: string): Promise<DatabaseMatch | null> {
  console.log('🎯 [detectMarketContextDb] Starting Market Context detection...');
  const databases = await searchUserDatabases(notionToken);

  const criteria = {
    titleMatches: ['Market Context', 'Market Regime', 'Daily Market'],
    titleWeight: 0.3,
    requiredProps: ['Market Regime', 'Risk Assessment', 'VIX Level'],
    requiredPropsWeight: 0.5,
    optionalProps: ['Top Sectors', 'Summary'],
    optionalPropsWeight: 0.2,
    propertyTypes: {
      'Market Regime': 'select',
      'Risk Assessment': 'select',
      'VIX Level': 'number'
    }
  };

  const scores = databases.map(db => {
    const title = db.title?.[0]?.plain_text || 'Untitled';
    const props = Object.keys(db.properties || {});
    const score = calculateMatchScore(db, criteria);

    console.log(`  📊 Scoring "${title}":`, {
      score: score.toFixed(3),
      properties: props,
      hasRequiredProps: criteria.requiredProps.every(req =>
        props.some(p => p.toLowerCase() === req.toLowerCase())
      ),
    });

    return {
      id: db.id,
      title,
      score,
    };
  });

  const best = scores.sort((a, b) => b.score - a.score)[0];

  console.log('🏆 [detectMarketContextDb] Best match:', best ? {
    title: best.title,
    score: best.score.toFixed(3),
    threshold: '0.5',
    passes: best.score >= 0.5,
  } : 'No matches');

  if (!best || best.score < 0.5) return null;

  return {
    ...best,
    confidence: best.score > 0.8 ? 'high' : best.score > 0.6 ? 'medium' : 'low',
  };
}

/**
 * Detect Sage Stocks hub page
 */
async function detectSageStocksPage(
  notionToken: string
): Promise<PageMatch | null> {
  console.log('🎯 [detectSageStocksPage] Starting Sage Stocks page detection...');
  const pages = await searchUserPages(notionToken);

  // Find page titled "Sage Stocks" or similar
  const matches = pages
    .map(page => {
      // Get title from properties
      const titleProp = Object.values(page.properties || {}).find(
        (prop: any) => prop.type === 'title'
      ) as any;

      const title = titleProp?.title?.[0]?.plain_text || '';
      const url = page.url || '';

      // Calculate score based on title match
      let score = 0;
      if (/sage\s*stocks/i.test(title)) score = 1.0;
      else if (/sage/i.test(title)) score = 0.6;
      else if (/stocks/i.test(title)) score = 0.4;

      console.log(`  📄 Scoring page "${title}":`, {
        score: score.toFixed(3),
        matchesSageStocks: /sage\s*stocks/i.test(title),
        matchesSage: /sage/i.test(title),
        matchesStocks: /stocks/i.test(title),
      });

      return {
        id: page.id,
        title,
        url,
        score,
        confidence: score > 0.8 ? 'high' as const : score > 0.5 ? 'medium' as const : 'low' as const,
      };
    })
    .filter(match => match.score > 0);

  const best = matches.sort((a, b) => b.score - a.score)[0];

  console.log('🏆 [detectSageStocksPage] Best match:', best ? {
    title: best.title,
    score: best.score.toFixed(3),
  } : 'No matches');

  return best || null;
}

/**
 * Auto-detect all template components with retry logic
 *
 * When Notion duplicates a template, the page appears immediately but databases
 * take a few seconds to be created. This function retries up to 3 times with
 * exponential backoff to wait for databases to appear.
 */
export async function autoDetectTemplate(
  notionToken: string
): Promise<DetectionResult> {
  const maxAttempts = 3;
  const delays = [0, 3000, 5000]; // 0ms, 3s, 5s

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`🔍 [autoDetectTemplate] Attempt ${attempt}/${maxAttempts}`);

    // Wait before retry (except first attempt)
    if (attempt > 1) {
      const delay = delays[attempt - 1];
      console.log(`⏱️  [autoDetectTemplate] Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const [stockAnalysesDb, stockHistoryDb, stockEventsDb, marketContextDb, sageStocksPage] = await Promise.all([
      detectStockAnalysesDb(notionToken),
      detectStockHistoryDb(notionToken),
      detectStockEventsDb(notionToken),
      detectMarketContextDb(notionToken),
      detectSageStocksPage(notionToken),
    ]);

    // Determine if manual setup is needed
    const needsManual = !stockAnalysesDb || !stockHistoryDb || !stockEventsDb || !marketContextDb || !sageStocksPage;

    const foundCount = [stockAnalysesDb, stockHistoryDb, stockEventsDb, marketContextDb, sageStocksPage].filter(Boolean).length;
    console.log(`📊 [autoDetectTemplate] Attempt ${attempt}: Found ${foundCount}/5 components`);

    // If we found everything, return immediately
    if (!needsManual) {
      console.log(`✅ [autoDetectTemplate] All components found on attempt ${attempt}`);
      return {
        stockAnalysesDb,
        stockHistoryDb,
        stockEventsDb,
        marketContextDb,
        sageStocksPage,
        needsManual: false
      };
    }

    // If this is not the last attempt, log what's missing and continue
    if (attempt < maxAttempts) {
      console.log(`⚠️  [autoDetectTemplate] Missing components on attempt ${attempt}:`, {
        stockAnalysesDb: !!stockAnalysesDb ? '✓' : '✗',
        stockHistoryDb: !!stockHistoryDb ? '✓' : '✗',
        stockEventsDb: !!stockEventsDb ? '✓' : '✗',
        marketContextDb: !!marketContextDb ? '✓' : '✗',
        sageStocksPage: !!sageStocksPage ? '✓' : '✗',
      });
      console.log(`🔄 [autoDetectTemplate] Retrying...`);
      continue;
    }

    // Last attempt - return what we found
    console.log(`❌ [autoDetectTemplate] Failed to find all components after ${maxAttempts} attempts`);
    return {
      stockAnalysesDb,
      stockHistoryDb,
      stockEventsDb,
      marketContextDb,
      sageStocksPage,
      needsManual: true
    };
  }

  // Should never reach here, but TypeScript requires a return
  throw new Error('autoDetectTemplate: Unexpected end of function');
}

/**
 * Test database read access
 */
export async function testDatabaseRead(notionToken: string, databaseId: string): Promise<boolean> {
  try {
    const notion = new Client({ auth: notionToken, notionVersion: '2025-09-03' });
    await notion.databases.retrieve({ database_id: databaseId });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Test database write access
 */
export async function testDatabaseWrite(notionToken: string, databaseId: string): Promise<boolean> {
  try {
    const notion = new Client({ auth: notionToken, notionVersion: '2025-09-03' });

    // Get data source ID for API v2025-09-03
    const db = await notion.databases.retrieve({ database_id: databaseId });
    const dataSourceId = (db as any).data_sources?.[0]?.id;

    if (!dataSourceId) {
      return false;
    }

    // Query the database (read operation that requires proper permissions)
    await notion.dataSources.query({
      data_source_id: dataSourceId,
      page_size: 1,
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Test page read access
 */
export async function testPageRead(notionToken: string, pageId: string): Promise<boolean> {
  try {
    const notion = new Client({ auth: notionToken, notionVersion: '2025-09-03' });
    await notion.pages.retrieve({ page_id: pageId });
    return true;
  } catch (error) {
    return false;
  }
}
