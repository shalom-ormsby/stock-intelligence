# Phase 1 Results: TypeScript Compilation Errors

**SDK Upgraded:** @notionhq/client v2.3.0 → v5.4.0 ✅
**Compilation Status:** ❌ 13 errors (as expected)
**Date:** 2024-12-14

---

## Error Summary

All errors fall into 3 categories matching our migration plan predictions:

### Category 1: Search Filter Type Change (3 errors)
**Issue:** Search filter value `'database'` changed to `'data_source'`

```
api/debug/list-templates.ts:43
lib/database-validator.ts:230
lib/template-detection.ts:56
```

**Error Message:**
```
Type '"database"' is not assignable to type '"page" | "data_source"'
```

**Fix:** Change search filter from `'database'` to `'data_source'`

---

### Category 2: databases.query() Removed (9 errors)
**Issue:** `notion.databases.query()` no longer exists - must use `notion.dataSources.query()`

```
lib/auth.ts:565           - getUsersByStatus()
lib/auth.ts:614           - getAllUsers()
lib/auth.ts:740           - getActiveUsers()
lib/notion-client.ts:266  - findPageByTicker()
lib/notion-client.ts:945  - queryHistoricalAnalyses()
lib/notion-poller.ts:112  - queryDatabase()
lib/orchestrator.ts:102   - collectStockRequests()
lib/template-detection.ts:378 - testDatabaseRead()
```

**Error Message:**
```
Property 'query' does not exist on type '{ retrieve: ... create: ... update: ... }'
```

**Fix Required:**
1. Get data source ID from database ID first
2. Use `notion.dataSources.query({ data_source_id: ... })` instead
3. Update method signatures and types

---

### Category 3: Type Import Changes (1 error)
**Issue:** `QueryDatabaseResponse` type removed from SDK

```
lib/notion-poller.ts:17
```

**Error Message:**
```
'"@notionhq/client/build/src/api-endpoints"' has no exported member named 'QueryDatabaseResponse'
```

**Fix:** Import correct type from new SDK (likely `QueryDataSourceResponse` or similar)

---

## Affected Files Analysis

### High Priority (Core Libraries)
1. **lib/notion-client.ts** (2 errors)
   - `findPageByTicker()` - Used by analysis flow
   - `queryHistoricalAnalyses()` - Used for delta calculations
   - **Impact:** Breaks analysis creation and historical context

2. **lib/auth.ts** (4 errors)
   - `getUsersByStatus()`, `getAllUsers()`, `getActiveUsers()`
   - **Impact:** Breaks user management and admin functions

3. **lib/orchestrator.ts** (1 error)
   - `collectStockRequests()` - Queries each user's database
   - **Impact:** Breaks scheduled analyses if orchestrator enabled

### Medium Priority (Setup & Detection)
4. **lib/template-detection.ts** (2 errors)
   - Search filter change + `testDatabaseRead()` query
   - **Impact:** Breaks auto-detection during setup

5. **lib/database-validator.ts** (1 error)
   - Search filter change in validation
   - **Impact:** Breaks database validation during setup

### Low Priority (Debug & Utilities)
6. **api/debug/list-templates.ts** (1 error)
   - Search filter change
   - **Impact:** Breaks debug endpoint (not critical)

7. **lib/notion-poller.ts** (2 errors)
   - Type import + `queryDatabase()` method
   - **Impact:** Breaks polling feature (if used)

---

## Fix Strategy

### Approach: Bottom-Up (Dependencies First)

#### Step 1: Create Helper Functions
Create reusable helper to get data source IDs:

```typescript
// lib/notion-helpers.ts (NEW FILE)
async function getDataSourceId(
  client: Client,
  databaseId: string
): Promise<string> {
  const db = await client.databases.retrieve({ database_id: databaseId });

  if (!db.data_sources || db.data_sources.length === 0) {
    throw new Error(`Database ${databaseId} has no data sources`);
  }

  return db.data_sources[0].id;
}
```

#### Step 2: Fix Search Filters (Quick Wins)
- api/debug/list-templates.ts:43
- lib/database-validator.ts:230
- lib/template-detection.ts:56

Change: `value: 'database'` → `value: 'data_source'`

#### Step 3: Fix Type Imports
- lib/notion-poller.ts:17

Research new type names in SDK v5 docs

#### Step 4: Fix databases.query() Calls
For each affected method:
1. Get data source ID from database ID
2. Change `databases.query()` to `dataSources.query()`
3. Update parameters to use `data_source_id`

**Order:**
1. lib/notion-client.ts (core, affects many flows)
2. lib/auth.ts (user management)
3. lib/orchestrator.ts (scheduled tasks)
4. lib/template-detection.ts (setup)
5. lib/notion-poller.ts (if used)

---

## Risk Assessment

### Breaking Change Impact

**Critical Flows Affected:**
- ✅ OAuth (not affected - uses pages, not databases)
- ❌ Analysis Creation (uses findPageByTicker)
- ❌ Historical Queries (queryHistoricalAnalyses)
- ❌ Setup/Auto-detection (template-detection)
- ❌ User Management (auth.ts queries)
- ❌ Orchestrator (if enabled)

**Low-Risk Changes:**
- Search filter updates (straightforward)
- Type import fixes (mechanical)

**High-Risk Changes:**
- databases.query() migrations (require testing each one)
- Data source ID resolution (new pattern)

---

## Next Steps

### Option A: Fix All Errors Now
Implement all fixes systematically:
1. Create helper functions
2. Fix search filters (3 files)
3. Fix type imports (1 file)
4. Fix database queries (9 locations)
5. Test after each file

**Estimated Time:** 1-2 hours
**Risk:** Medium (many changes at once)

### Option B: Fix Incrementally
Fix one category at a time:
1. Fix search filters only → test → commit
2. Fix type imports → test → commit
3. Fix database queries one file at a time → test each → commit

**Estimated Time:** 2-3 hours
**Risk:** Low (incremental, testable)

### Option C: Review & Plan Further
- Review each error location in code
- Understand context and dependencies
- Plan detailed fix for each location
- Then implement

**Estimated Time:** 3-4 hours total
**Risk:** Very Low (most thorough)

---

## Recommendation

**Recommended:** Option B (Incremental)

**Reasoning:**
1. Search filter fixes are safe and quick (mechanical changes)
2. Can test OAuth after search filter fixes (critical validation)
3. Database query fixes need careful testing each
4. Incremental commits provide rollback points
5. Lower cognitive load, easier to debug

**First Batch:** Fix search filters (3 files) + test OAuth
**Second Batch:** Fix type imports + test compilation
**Third Batch:** Fix database queries one file at a time

---

## Success Criteria for Phase 1

- ✅ SDK upgraded to v5.4.0
- ✅ All TypeScript errors documented
- ✅ Fix strategy planned
- ⏳ All TypeScript errors resolved (next step)
- ⏳ TypeScript compiles with no errors
- ⏳ OAuth still works (critical test)

---

**Status:** Phase 1 Analysis Complete ✅
**Next Action:** Choose implementation approach and begin fixes
**Rollback:** `git checkout main` to revert if needed
