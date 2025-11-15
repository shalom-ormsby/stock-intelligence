# Notion API Version 2025-09-03 Migration Guide

## ⚠️ CRITICAL: This is NOT a Simple Version Update

The 2025-09-03 API version introduces **BREAKING CHANGES** that require significant code refactoring. This is not just a version header update.

## Why We Reverted (Dec 2024)

Initial attempt to update by simply changing `notionVersion: '2025-09-03'` caused OAuth failures because the new API version has fundamental changes to how databases work.

## Breaking Changes Summary

### 1. Database ID → Data Source ID

**Old way (current):**
```typescript
const notion = new Client({ auth: token });

// Create page in database
await notion.pages.create({
  parent: { database_id: 'abc123' },
  properties: { ... }
});

// Query database
await notion.databases.query({
  database_id: 'abc123',
  filter: { ... }
});
```

**New way (2025-09-03):**
```typescript
const notion = new Client({ auth: token, notionVersion: '2025-09-03' });

// Step 1: Get data source ID from database
const db = await notion.databases.retrieve({ database_id: 'abc123' });
const dataSourceId = db.data_sources[0].id; // NEW: databases now have multiple data sources

// Step 2: Create page with data source ID
await notion.pages.create({
  parent: { data_source_id: dataSourceId }, // CHANGED: use data_source_id
  properties: { ... }
});

// Step 3: Query data source (not database!)
await notion.dataSources.query({ // CHANGED: new endpoint
  data_source_id: dataSourceId,
  filter: { ... }
});
```

### 2. Search API Changes

**Old:**
```typescript
const results = await notion.search({
  filter: { property: 'object', value: 'database' }
});
```

**New:**
```typescript
const results = await notion.search({
  filter: { property: 'object', value: 'data_source' } // CHANGED
});
```

### 3. Relation Properties

**Old:**
```typescript
properties: {
  'Related Items': {
    relation: [
      { id: 'page-id-1' }
    ]
  }
}
```

**New:**
```typescript
properties: {
  'Related Items': {
    relation: [
      {
        id: 'page-id-1',
        data_source_id: 'datasource-123' // REQUIRED
      }
    ]
  }
}
```

## Files That Need Migration

When we're ready to migrate, these files need updates:

### Core Libraries (High Priority)
1. **[lib/notion-client.ts](lib/notion-client.ts)** - Main Notion wrapper
   - `syncToNotion()` - Uses `databases.query()`
   - `upsertAnalyses()` - Uses `pages.create()` with database parent
   - `createHistory()` - Uses `pages.create()` with database parent
   - `findPageByTicker()` - Uses `databases.query()`
   - `queryHistoricalAnalyses()` - Uses `databases.query()`

2. **[lib/auth.ts](lib/auth.ts)** - User management
   - `createOrUpdateUser()` - Creates pages in Beta Users database
   - `updateUserStatus()` - Updates pages in database

3. **[lib/orchestrator.ts](lib/orchestrator.ts)** - Scheduled analyses
   - `collectStockRequests()` - Queries Stock Analyses databases
   - Uses `databases.query()` with filters

4. **[lib/database-validator.ts](lib/database-validator.ts)** - Setup validation
   - `validateDatabaseConfig()` - Validates database access
   - Uses `databases.retrieve()`

### API Endpoints (Medium Priority)
5. **[api/setup.ts](api/setup.ts)** - First-time setup
   - Stores database IDs → needs to store data source IDs
   - `testDatabaseRead()` and `testDatabaseWrite()` helpers

6. **[api/analyze.ts](api/analyze.ts)** - Main analysis endpoint
   - Uses NotionClient extensively (inherits all changes)

7. **[api/auth/callback.ts](api/auth/callback.ts)** - OAuth flow
   - Post-OAuth diagnostic search (already failed with new version)

### Helper Modules (Low Priority)
8. **[lib/template-detection.ts](lib/template-detection.ts)** - Auto-detection
   - `autoDetectTemplate()` - Searches for databases
   - Uses `search()` API with database filter

9. **[lib/notion-poller.ts](lib/notion-poller.ts)** - Database polling
   - `queryDatabase()` - Polls for pending analyses

## Migration Strategy (Future)

### Phase 1: Research & Planning (1-2 days)
1. Read full Notion migration guide: https://developers.notion.com/docs/upgrade-guide-2025-09-03
2. Upgrade @notionhq/client to v5.0.0+
3. Test in isolated branch with duplicate template
4. Map all database operations in codebase

### Phase 2: Code Changes (3-5 days)
1. **Add data source ID storage**
   - Add `stockAnalysesDataSourceId` and `stockHistoryDataSourceId` to User type
   - Update Beta Users database schema to store data source IDs
   - Create migration script to populate existing users

2. **Update NotionClient class**
   - Add `getDataSourceId(databaseId)` helper method
   - Update all `databases.query()` calls → `dataSources.query()`
   - Update all `pages.create()` to use data_source_id parent
   - Update relation properties to include data_source_id

3. **Update setup flow**
   - Modify auto-detection to find and store data source IDs
   - Update validation to check data source access
   - Add upgrade path for existing users

4. **Update orchestrator**
   - Change database queries to data source queries
   - Update page creation logic

### Phase 3: Testing (2-3 days)
1. Test OAuth flow end-to-end
2. Test first-time setup (auto-detection)
3. Test analysis creation
4. Test scheduled analyses
5. Test with multiple data sources (future feature)

### Phase 4: Deployment (1 day)
1. Deploy to staging first
2. Test with production template duplicate
3. Monitor for errors
4. Deploy to production
5. Monitor all users' first analyses

## Estimated Total Time: 1-2 weeks

## Why This Matters

Multi-source databases are a new Notion feature that allows one database to pull from multiple data sources. While we don't use this feature yet, **if any user adds another data source to their database, all our API calls will fail** unless we migrate.

## Current Status

- **API Version**: Default (auto-selected by SDK, likely 2022-06-28)
- **Deprecation Warning**: May appear in logs, but not critical yet
- **Risk**: Medium - works fine until users start using multi-source features
- **Priority**: Low-Medium - can wait until planned maintenance window

## References

- [Official Migration Guide](https://developers.notion.com/docs/upgrade-guide-2025-09-03)
- [TypeScript SDK v5 Release](https://github.com/makenotion/notion-sdk-js/releases)
- [Notion API Versioning](https://developers.notion.com/reference/versioning)

---

**Last Updated**: 2024-12-14
**Created By**: Claude Code (automated)
**Status**: ⏸️ Postponed - requires full migration, not urgent
