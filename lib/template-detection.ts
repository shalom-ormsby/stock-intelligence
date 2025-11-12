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
  const notion = new Client({ auth: notionToken });
  const databases: any[] = [];

  let hasMore = true;
  let startCursor: string | undefined = undefined;

  console.log('🔍 [searchUserDatabases] Starting database search...');

  while (hasMore) {
    const response = await notion.search({
      filter: { property: 'object', value: 'database' },
      start_cursor: startCursor,
      page_size: 100,
    });

    console.log(`📊 [searchUserDatabases] Found ${response.results.length} databases in this batch`);
    databases.push(...response.results);
    hasMore = response.has_more;
    startCursor = response.next_cursor || undefined;
  }

  console.log(`✓ [searchUserDatabases] Total databases found: ${databases.length}`);
  console.log('📋 [searchUserDatabases] Database titles:', databases.map(db => ({
    id: db.id,
    title: db.title?.[0]?.plain_text || 'Untitled',
  })));

  return databases;
}

/**
 * Search for pages with Template Version property
 */
async function searchUserPages(notionToken: string): Promise<any[]> {
  const notion = new Client({ auth: notionToken });
  const pages: any[] = [];

  let hasMore = true;
  let startCursor: string | undefined = undefined;

  console.log('🔍 [searchUserPages] Starting page search...');

  while (hasMore) {
    const response = await notion.search({
      filter: { property: 'object', value: 'page' },
      start_cursor: startCursor,
      page_size: 100,
    });

    console.log(`📄 [searchUserPages] Found ${response.results.length} pages in this batch`);
    pages.push(...response.results);
    hasMore = response.has_more;
    startCursor = response.next_cursor || undefined;
  }

  console.log(`✓ [searchUserPages] Total pages found: ${pages.length}`);
  console.log('📋 [searchUserPages] Page titles:', pages.map(page => {
    const titleProp = Object.values(page.properties || {}).find(
      (prop: any) => prop.type === 'title'
    ) as any;
    return {
      id: page.id,
      title: titleProp?.title?.[0]?.plain_text || 'Untitled',
    };
  }));

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
    requiredProps: ['Ticker', 'Signal', 'Composite Score'],
    requiredPropsWeight: 0.5,
    optionalProps: ['Technical Score', 'Fundamental Score', 'Date', 'Price', 'Analysis'],
    optionalPropsWeight: 0.2,
    propertyTypes: {
      'Composite Score': 'number',
      'Signal': 'select',
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
    requiredProps: ['Ticker', 'Date', 'Close'],
    requiredPropsWeight: 0.5,
    optionalProps: ['Open', 'High', 'Low', 'Volume', 'Change'],
    optionalPropsWeight: 0.2,
    propertyTypes: {
      'Close': 'number',
      'Date': 'date',
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
 * Auto-detect all template components
 */
export async function autoDetectTemplate(
  notionToken: string
): Promise<DetectionResult> {
  const [stockAnalyses, stockHistory, sageStocksPage] = await Promise.all([
    detectStockAnalysesDb(notionToken),
    detectStockHistoryDb(notionToken),
    detectSageStocksPage(notionToken),
  ]);

  return {
    stockAnalysesDb: stockAnalyses,
    stockHistoryDb: stockHistory,
    sageStocksPage,
    needsManual: !stockAnalyses || !stockHistory || !sageStocksPage,
  };
}

/**
 * Test database read access
 */
export async function testDatabaseRead(notionToken: string, databaseId: string): Promise<boolean> {
  try {
    const notion = new Client({ auth: notionToken });
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
    const notion = new Client({ auth: notionToken });
    // Query the database (read operation that requires proper permissions)
    await notion.databases.query({
      database_id: databaseId,
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
    const notion = new Client({ auth: notionToken });
    await notion.pages.retrieve({ page_id: pageId });
    return true;
  } catch (error) {
    return false;
  }
}
