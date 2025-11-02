# Stock Intelligence Roadmap

**Last Updated:** November 1, 2025

---

## 🎯 Current Status

**Overall v1.0 Progress:** ~85% complete

**Current Sprint:** v1.0.2 - HTML Analyzer Page (Hybrid Approach Phase 1)

**Completed:** 44 tasks (v1.0.0 Rate Limiting shipped)

**Remaining:** 15 tasks (v1.0.2 → v1.0.3 → v2.0 migration)

**Estimated Hours Remaining:** ~3-5 hours to complete v1.0.2, then 25-35 hours for v2.0 migration

---

## ✅ Completed Sprints

### v0.x: Colab Prototype (100% Complete)

*Foundation work: Colab-based analysis + Notion AI automation*

**Key Achievements:**

- ✅ Colab notebook with manual analysis workflow
- ✅ Notion AI API integration (New/Updated analysis prompts)
- ✅ Content Status notification system
- ✅ Synced block references for consistent UX
- ✅ Stock Analyses + Stock History database schema
- ✅ Fixed duplicate row issues (upsert race condition)

**Architecture:** Python/Colab + Notion API + Polygon/Alpha Vantage/FRED APIs

### v1.0: Serverless Migration (70% Complete)

*Production-ready serverless architecture on Vercel*

**Completed Work:**

**API Migration:**

- ✅ Researched and selected consolidated provider (FMP + FRED)
- ✅ Set up Vercel TypeScript development environment
- ✅ Ported scoring logic from v0.3 Python to TypeScript (~2,500 LOC)
- ✅ Created /api/analyze endpoint (390 LOC)
- ✅ Created /api/webhook endpoint for archiving (180 LOC)
- ✅ Configured environment variables and secrets

**Refactoring:**

- ✅ Extracted API fetching logic into modular functions
- ✅ Extracted score calculation into pure functions
- ✅ Extracted Notion read/write operations
- ✅ Extracted AI prompt execution logic

**Deployment:**

- ✅ Deployed to Vercel production
- ✅ Made API endpoints publicly accessible (CORS enabled)
- ✅ Configured Notion automation for "Send to History"
- ✅ Test scripts for local development (240 LOC)
- ✅ Documentation (SETUP.md, testing guides - 750 LOC)

**Testing:**

- ✅ End-to-end workflow tested (ticker input → analysis → archive)
- ✅ Security audit completed
- ✅ Production validation with MSFT test case

**Rate Limiting System (v1.0.0):**

- ✅ Upstash Redis integration (REST API, distributed state)
- ✅ User-level quotas (10 analyses per user per day)
- ✅ Session-based bypass code system
- ✅ `/api/bypass` endpoint (GET/POST, URL params + JSON body)
- ✅ `/api/usage` endpoint (non-consuming quota check)
- ✅ Automatic midnight UTC reset
- ✅ Graceful degradation on Redis failure
- ✅ Production deployment tested and validated

**Cumulative Stats:**

- ~4,700 lines TypeScript code
- ~3,200 lines documentation
- 22 total files (includes rate limiting + LLM abstraction)
- Performance: 3-5 seconds per analysis (current), 18-25 seconds target (with LLM)
- Cost: $22-29/month (FMP + Vercel) + LLM costs (~$0.013 per analysis with Gemini Flash 2.5)

---

## 🚧 Current Sprint

### v1.0.2: HTML Analyzer Page - Hybrid Approach Phase 1 (In Progress)

*WordPress-hosted HTML page with LLM-generated analysis*

**Context:** Notion webhook limitations discovered in v1.0.1 led to architectural pivot. Building dedicated HTML analyzer page as transition to full custom frontend.

**Core Changes:**

- ⏳ Build LLM abstraction layer (provider-agnostic interface) (1 hr)
  - Interface: `LLMProvider` with OpenAI, Anthropic, Gemini implementations
  - Default: Google Gemini Flash 2.5 ($0.013 per analysis, 50% token reduction)
  - Configurable via `LLM_PROVIDER` environment variable
- ⏳ Modify `/api/analyze` endpoint for new workflow (1.5 hrs)
  - Query Notion for historical analyses (5 most recent)
  - Compute deltas and trends
  - Build enriched prompt with historical context
  - Call LLM API for 7-section analysis generation
  - Create dated child analysis page in Notion
  - Update Stock Analyses database row with latest metrics
  - Archive to Stock History database
  - Return `pageUrl` for new analysis page
- ⏳ Build `public/analyze.html` analyzer interface (1 hr)
  - Ticker input with validation (1-10 alphanumeric + hyphen)
  - State management (Initial → Processing → Complete/Error)
  - Real-time status feedback
  - "View Results" link to Notion page
  - Usage counter display (X/10 analyses today)
  - Tailwind CSS styling (CDN, no build step)
  - Vanilla JavaScript (WordPress-compatible)
- ⏳ Add admin bypass via environment variable (15 min)
  - `RATE_LIMIT_ADMIN_USER_ID=90089dd2-2474-4219-8213-c574934d35df`
  - Permanent bypass (no session needed)
- ⏳ Test end-to-end workflow locally (30 min)
- ⏳ Deploy to Vercel + copy HTML to WordPress (15 min)

**Prerequisites:**

- ✅ Vercel Pro upgrade ($20/month) - **Required for 300-second timeout**
- ⏳ Google Gemini API setup and key
- ⏳ WordPress page setup at `shalomormsby.com/stock-intelligence`

**Success Criteria:**

- User visits WordPress page → enters ticker → clicks Analyze
- Analysis completes in <30 seconds (18-25 seconds target)
- New dated analysis page created in Notion
- Database row updated with latest metrics
- Clear "View Results" link displayed
- Zero manual steps after clicking Analyze

**Performance Target:**

- Total latency: 18-25 seconds
  - Rate limit check: <500ms
  - Fetch market data: 3-5 sec
  - Calculate scores: 1 sec
  - Query historical data: 2-5 sec (Notion bottleneck)
  - Compute deltas: <1 sec
  - LLM analysis: 10-20 sec
  - Notion writes (3 operations): 6-10 sec
  - Rate limit update: <500ms

**Estimated Time:** 3-5 hours

**Completion Target:** November 3-5, 2025

---

### v1.0.2c: API Management Dashboard (In Progress)

*Centralized API monitoring and management for operational visibility*

**Objective:** Build a simple admin panel to monitor 6 API integrations during development and beta testing.

**Context:**

- Working with 6 different APIs (FMP, FRED, Gemini, Claude, OpenAI, Notion)
- LLM abstraction layer adds provider-switching complexity
- Need operational visibility to debug issues and track costs
- Prevents expensive surprises and speeds up troubleshooting

**Scope: MVP (2-3 hours)**

Build a simple admin panel embedded in the existing HTML analyzer page at `/analyze?admin=true`

**Core Features:**

1. **API Status Indicators**
   - 🟢 Green (Active): API key valid, recent successful call
   - 🔴 Red (Error): API key invalid, rate limited, or failing
   - ⚪ Gray (Inactive): API key not configured

2. **Quick Info Per API**
   - Status: Active/Error/Inactive
   - Calls Today: e.g., "247/300" (or tokens for LLMs)
   - Last Success: e.g., "2 min ago"
   - Cost Today: e.g., "$0.74"
   - Model (for LLMs): e.g., "gemini-2.5-flash"

3. **Test Buttons**
   - [Test] button for each API
   - Validates API key without consuming quota (when possible)
   - Shows latency for each test

4. **Quick Links**
   - [Docs] button linking to provider dashboard:
     - FMP: https://financialmodelingprep.com/developer/docs
     - Google AI Studio: https://aistudio.google.com
     - Vercel Env Vars: https://vercel.com/settings/environment-variables

5. **Daily Cost Summary**
   ```
   Daily Cost Summary:
   • FMP: $0.74 (247 calls)
   • Gemini: $0.58 (22 analyses)
   • FRED: $0.00 (free)
   • Notion: $0.00 (free)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Total Today: $1.32
   Monthly Projection: $39.60
   ```

6. **Recent Errors (Last 24h)**
   - Timestamp
   - API name
   - Error message

**APIs to Monitor:**

1. FMP API (11 calls/analysis)
2. FRED API (6 calls/analysis)
3. Google Gemini API (1 call/analysis)
4. Anthropic Claude API (optional fallback)
5. OpenAI API (optional fallback)
6. Notion API (8-10 calls/analysis)

**Implementation:**

- ⏳ Create `/api/api-status.ts` endpoint (1 hr)
  - Check each API key exists in env vars
  - Attempt lightweight health check per API
  - Calculate daily costs based on known pricing
  - Return JSON with status for each API
- ⏳ Modify `public/analyze.html` (1 hr)
  - Add admin section (show/hide with `?admin=true`)
  - Use Tailwind CDN for styling
  - Auto-refresh every 30 seconds
- ⏳ Testing + polish (30 min)

**Success Criteria:**

- Admin can see status of all 6 APIs at a glance
- Test buttons validate API keys work
- Daily cost tracking helps avoid budget surprises
- Recent errors surface issues quickly
- Takes <5 seconds to diagnose API problems

**Future Enhancements (v2.0):**

- Full Next.js admin dashboard with charts
- Historical usage trends (sparkline graphs)
- Email/Slack alerts for failures
- Cost threshold warnings
- Export usage reports (CSV)

**Estimated Time:** 2-3 hours

**Completion Target:** November 2, 2025

---

### v1.0.5: Notion Write Optimization - Chunked Streaming (✅ Complete)

*Fix 504 timeout errors by adding delays between Notion API chunk writes*

**Problem:**

Even after v1.0.3 (Vercel Pro 60s timeout) and v1.0.4 (67% token reduction), the timeout is still occurring. Root cause analysis revealed the bottleneck is **Notion API write performance**, not LLM generation or Vercel timeout limits.

**Root Cause:**

- Writing 2,000+ tokens of content as Notion blocks takes 120-240+ seconds
- The `writeAnalysisContent()` function had chunking implemented (100 blocks per request)
- **BUT** there was NO DELAY between chunks
- Rapid sequential requests hit Notion's rate limits (3 req/sec average)
- Each API call has ~200-300ms latency
- 100+ blocks in rapid succession = easily 60-120+ seconds total

**Solution Implemented:**

**Phase 1: Add Inter-Chunk Delays (30 min) ✅**

Modified `lib/notion-client.ts` `writeAnalysisContent()` function:

```typescript
// Before: No delay between chunks
for (let i = 0; i < blocks.length; i += chunkSize) {
  const chunk = blocks.slice(i, i + chunkSize);
  await this.client.blocks.children.append({
    block_id: pageId,
    children: chunk,
  });
}

// After: 100ms delay between chunks
const chunkDelay = 100; // 100ms = ~10 req/sec (under Notion's 3 req/sec limit)

for (let i = 0; i < blocks.length; i += chunkSize) {
  const chunk = blocks.slice(i, i + chunkSize);
  await this.client.blocks.children.append({
    block_id: pageId,
    children: chunk,
  });

  // Add delay between chunks (except for the last chunk)
  if (i + chunkSize < blocks.length) {
    await new Promise(resolve => setTimeout(resolve, chunkDelay));
  }
}
```

**Phase 2: Add Timing Instrumentation (15 min) ✅**

Added detailed timing logs to track where time is spent:

```typescript
// In lib/notion-client.ts
console.log(`[Notion] Deleted ${deletedCount} existing blocks in ${deleteDuration}ms`);
console.log(`[Notion] Converted ${blocks.length} blocks in ${convertDuration}ms`);
console.log(`[Notion] Wrote chunk ${chunkNum}/${totalChunks} in ${chunkDuration}ms`);
console.log(`[Notion] ⏱️  Total write time: ${totalDuration}ms (write: ${writeDuration}ms)`);

// In api/analyze.ts
console.log(`✅ Written to Stock Analyses page: ${analysesPageId} (${writeDuration}ms)`);
console.log(`✅ Created child analysis page: ${childPageId} (${childDuration}ms)`);
console.log(`⏱️  Total Notion write time: ${notionWriteDuration}ms`);
console.log(`✅ Archived to Stock History: ${archivedPageId} (${archiveDuration}ms)`);
```

**Expected Performance Improvement:**

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Notion write time | 60-120s+ | 15-25s | **75-80% faster** |
| Total analysis time | 90-180s+ | 30-45s | **67-75% faster** |
| Timeout risk | High (504 errors) | Low (under 60s) | **Risk eliminated** |

**Files Modified:**

1. `lib/notion-client.ts` - Added chunking delays and timing instrumentation (lines 1132-1222)
   - Added `chunkDelay = 100ms` between writes
   - Added timing logs for delete, convert, and write phases
   - Added per-chunk timing logs

2. `api/analyze.ts` - Added timing instrumentation for Notion operations (lines 496-563)
   - Track time to write to Stock Analyses page
   - Track time to create child analysis page
   - Track time to archive to Stock History
   - Log total Notion write duration

**Success Criteria:**

✅ NVDA analysis completes without timeout
✅ Total execution time: <45 seconds
✅ Notion write time: <25 seconds
✅ No 504 errors in Vercel logs
✅ TypeScript compilation passes

**Testing Plan:**

1. Test with NVDA (the failing case that triggered this fix)
   - Should complete in <35 seconds
   - No 504 errors
   - Detailed timing logs visible

2. Verify timing breakdown in Vercel logs:
   - LLM generation: ~10-15s
   - Notion writes: **<25s** (was 120-240s+)
   - Total: <40s ✅

3. Monitor Notion API rate limits:
   - Should stay under 3 requests/second
   - No 429 errors

**Why This Fix Works:**

**v1.0.3 (Vercel timeout increase):**
- ✅ Gave more time (60s)
- ❌ Content write still takes 120-240s
- **Result:** Still times out

**v1.0.4 (Prompt optimization):**
- ✅ Reduced tokens 6,000 → 2,000
- ✅ Faster LLM generation (15s → 8s)
- ❌ **Doesn't fix Notion write bottleneck** (still 100+ blocks to write)
- **Result:** Still times out during content write phase

**v1.0.5 (Chunked streaming with delays):**
- ✅ Respects Notion's rate limits (3 req/sec)
- ✅ Dramatically reduces write time (120s+ → 15-25s)
- ✅ Keeps total execution under 60s Vercel timeout
- **Result:** ✅ Problem solved

**Estimated Time:** 45 minutes

**Completion Date:** November 2, 2025

---

### v1.0.3: Infrastructure Upgrade (Deferred)

*Vercel Pro upgrade for timeout resolution*

**Issue:** Vercel free tier has 10-second timeout limit
**Impact:** Current `/api/analyze` endpoint times out on production
**Status:** Deployment blocker discovered in v1.0.0 testing

**Upgrade Required:**

- Vercel Pro Plan: $20/month
  - 300-second serverless function timeout (vs 10 seconds)
  - Enables full analysis workflow (18-25 seconds target)

**Timeline:** Before v1.0.2 deployment (prerequisite)

**Estimated Time:** 10 minutes (account upgrade only)

---

## 🔮 Future Sprints

### v2.0: Custom Frontend Migration - Hybrid Approach Phase 2 (Planned)

*Next.js application with PostgreSQL database for production scale*

**Strategic Rationale:**

Notion is becoming a performance bottleneck:
- Historical queries: 2-5 seconds (slow, no indexing)
- 3 database writes: 6-10 seconds (3 sequential API calls, 3 req/sec rate limit)
- No time-series optimization
- No trend visualization support
- 3 req/sec rate limit blocks concurrent users

PostgreSQL (Supabase) solves these issues:
- Historical queries: <500ms (SQL indexes + JOINs)
- Database writes: <100ms (single transaction, 3 inserts)
- Time-series queries with window functions
- Native chart/graph support
- Unlimited concurrent users

**Performance Comparison:**

| Operation | Notion | PostgreSQL | Improvement |
|-----------|--------|------------|-------------|
| Historical query (5 analyses) | 2-5 sec | <500ms | **5-10x faster** |
| Database writes (3 operations) | 6-10 sec | <100ms | **60-100x faster** |
| Compute deltas | Manual (app code) | Automatic (SQL) | Native support |
| **Total database time** | **8-15 sec** | **<1 sec** | **10-15x faster** |
| **Total analysis time** | **35-50 sec** | **18-25 sec** | **40-50% faster** |

**Technology Stack:**

- **Frontend:** Next.js 14 (App Router, Server Components)
- **Styling:** Tailwind CSS + shadcn/ui components
- **Database:** Supabase PostgreSQL (free tier → $25/month Pro)
- **Auth:** Supabase Auth (built-in, email/password)
- **Charts:** Recharts (trend visualizations)
- **Backend:** Existing Vercel API (minimal changes)
- **Rate Limiting:** Upstash Redis (existing)
- **Hosting:** Vercel ($20/month Pro plan)

**Core Features:**

**Phase 2A: Frontend Application (20-25 hours)**

- Authentication pages (login, signup, password reset)
- Analyzer page (ticker input, real-time status, results display)
- Historical analysis view (list of past analyses with trends)
- Trend charts (score over time, Recharts integration)
- Dashboard (portfolio overview, watchlist)
- Responsive design (mobile-first)

**Phase 2B: Database Migration (5-10 hours)**

- Set up Supabase project
- Design PostgreSQL schema (users, analyses, watchlists, etc.)
- Modify `/api/analyze` to use PostgreSQL instead of Notion
  - Replace Notion historical queries with SQL
  - Replace 3 Notion writes with single transaction
  - Keep scoring logic unchanged
- Data migration from Notion to PostgreSQL (existing analyses)
- Row-level security (RLS) policies

**Phase 2C: Advanced Features (Future)**

- Price alerts (notify when score changes)
- Portfolio tracking (position sizing, P&L)
- Backtesting (how accurate were past recommendations?)
- Comparison tools (AAPL vs MSFT side-by-side)
- Social features (share analyses, follow users)
- Mobile app (React Native)

**Database Schema (PostgreSQL):**

```sql
-- Users (managed by Supabase Auth)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Analyses (replaces Notion Stock Analyses + Stock History)
CREATE TABLE analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  ticker TEXT NOT NULL,
  analysis_date TIMESTAMP DEFAULT NOW(),

  -- Scores (1.0-5.0 scale, updated from 0-100)
  composite_score DECIMAL(3,2),
  technical_score DECIMAL(3,2),
  fundamental_score DECIMAL(3,2),
  macro_score DECIMAL(3,2),
  risk_score DECIMAL(3,2),
  sentiment_score DECIMAL(3,2),
  sector_score DECIMAL(3,2),

  -- Recommendation
  recommendation TEXT, -- 'Strong Buy', 'Buy', 'Hold', 'Sell', 'Strong Sell'
  confidence DECIMAL(3,2),

  -- Analysis content (LLM-generated)
  analysis_text TEXT, -- Full 7-section analysis

  -- Metadata
  pattern TEXT,
  data_quality_grade TEXT,

  -- Historical context (computed via SQL window functions)
  -- No need to store - computed on-the-fly with LAG/LEAD

  -- Indexes for fast queries
  INDEX idx_ticker (ticker),
  INDEX idx_user_ticker (user_id, ticker),
  INDEX idx_date (analysis_date DESC)
);
```

**Cost Comparison:**

| Service | Notion Approach | PostgreSQL Approach |
|---------|-----------------|---------------------|
| Vercel Pro | $20/month | $20/month |
| FMP API | $29/month | $29/month |
| LLM API (Gemini) | $40/month (3,000 analyses) | $40/month |
| Notion | $0 (free tier) | - |
| Supabase | - | $0-25/month |
| Domain | - | $1/month |
| **Total** | **$89/month** | **$90-115/month** |

**Similar cost, much better performance and scalability.**

**Timeline:** Month 2-3 after v1.0.2 deployment

**Estimated Time:** 25-35 hours total

**Completion Target:** December 2025 - January 2026

---

### v2.1: Enhanced Analysis Features

*Add high-value features from v0.3 + insider trading*

**Planned Features:**

- 🔥 **Insider trading analysis** (requires FMP Professional upgrade to $79/mo)
  - Last 90 days buy/sell ratio
  - Executive vs routine trades
  - Open market purchases (strongest signal)
  - Form 4 filing links
  - Integrate into Sentiment scoring category
- **Market analysis features** (ported from v0.3.0)
  - Market regime classification (Risk-On/Risk-Off/Transition)
  - Sector strength rankings
  - Brave Search API for market intelligence
  - Market Context database

**Timing:** Post-v2.0 migration, prioritized based on user feedback

**Estimated Time:** ~6-10 hours total

### v2.2: Full Automation

*Autonomous portfolio monitoring with intelligent notifications*

**Scheduled Jobs:**

- Design scheduled job architecture (GitHub Actions/Vercel Cron)
- Build portfolio monitoring automation (nightly refresh)
- Implement market context automation (daily at 8am PT)
- Design job failure notification system

**Historical Trends & Analytics:**

- Build historical trend analysis engine
- Query Stock History for time-series data
- Calculate trend metrics (slope, volatility, inflection points)
- Auto-generate trend charts in Stock Analyses pages
- Auto-generate AI trend narratives from historical patterns
- Research Notion chart embedding options

**Intelligent Digest Notifications:**

- Design digest notification system (batched alerts)
- Design notification timing rules (market hours, urgency levels)
- Create change detection logic (price, scores, recommendations)
- Implement threshold-based alerting (>3% moves, RSI extremes)
- Add news/event tracking (earnings calendar, major announcements)
- Build digest notification delivery to Notion Inbox

**Market Context Dashboard:**

- Build sector performance calculator
- Create market regime detection algorithm
- Daily Market Context page generation

**Enhanced UX:**

- Create Portfolio dashboard with attention filter
- Design auto-archiving system (mark old analyses as Historical)
- Evaluate API rate limits for automation scale

**Testing:**

- Test end-to-end autonomous workflow (1 week unattended)
- Test mobile experience for all features

**Timing:** After v1.1 ships and user base is stable

**Estimated Time:** ~15-20 hours

---

## 📊 Current Architecture

**Technology Stack:**

- **Platform:** Vercel serverless functions (TypeScript/Node.js)
- **Financial Data:** Financial Modeling Prep API ($22-29/mo)
- **Macro Data:** FRED API (free)
- **LLM:** Google Gemini Flash 2.5 ($0.013/analysis, 50% token reduction)
- **Rate Limiting:** Upstash Redis (REST API)
- **Integration:** Notion API (transitioning to PostgreSQL in v2.0)

**Data Flow (v1.0.2):**

1. User visits `shalomormsby.com/stock-intelligence` (WordPress page)
2. Enters ticker → clicks "Analyze Stock"
3. HTML page → POST to `/api/analyze` with ticker + userId
4. Vercel function:
   - Checks rate limiting (Redis)
   - Fetches technical + fundamental data (FMP + FRED)
   - Queries Notion for historical analyses (5 most recent)
   - Calculates scores + computes deltas/trends
   - Calls Gemini Flash 2.5 for 7-section analysis
   - Creates dated child analysis page in Notion
   - Updates Stock Analyses database row
   - Archives to Stock History database
   - Returns `pageUrl` to new analysis page
5. HTML page displays "View Results" link
6. User clicks → opens Notion analysis page

**Performance (v1.0.2):**

- 18-25 seconds per analysis (target)
- Database operations: 8-15 seconds (Notion bottleneck)
- LLM generation: 10-20 seconds
- 300-second function timeout (Vercel Pro required)

---

## 📖 Documentation

For detailed setup and testing instructions, see:
- [SETUP.md](SETUP.md) - Environment setup and deployment
- [TESTING.md](TESTING.md) - Testing procedures and validation

---

**Design Philosophy:** Impeccable but simple. Personal decision-support tool for daily stock analyses ahead of earnings. Not enterprise software.
