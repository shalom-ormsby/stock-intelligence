# Sage Stocks Architecture

*Last updated: November 3, 2025 at 4:51 PM*

**Version:** 1.0.2-alpha (Hybrid Approach Phase 1)
**Status:** In Development (v1.0.2 HTML Analyzer Page)

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Data Flow Diagram](#data-flow-diagram-v102)
4. [Architecture Diagram](#architecture-diagram-v102)
5. [Component Structure](#component-structure)
6. [Data Flow](#data-flow)
7. [API Endpoints](#api-endpoints)
8. [External Integrations](#external-integrations)
9. [Rate Limiting Architecture](#rate-limiting-architecture)
10. [Security Model](#security-model)
11. [Deployment Architecture](#deployment-architecture)
12. [Configuration](#configuration)
13. [Design Decisions](#design-decisions)

---

## System Overview

Sage Stocks is a **serverless backend system** that provides automated stock analysis using technical and fundamental data, with LLM-generated analysis narratives. It's designed as a personal decision-support tool currently using Notion for storage (transitioning to PostgreSQL in v2.0).

**Core Capabilities:**
- Real-time stock analysis (technical + fundamental indicators)
- Composite scoring algorithm (1.0-5.0 scale, 6 categories)
- Pattern matching and trend detection
- LLM-generated 7-section analysis (Google Gemini Flash 2.5)
- Historical context and delta tracking
- Rate-limited API access (10 analyses per user per day)
- Session-based bypass code system
- Notion database integration (v1.0.2) → PostgreSQL migration (v2.0)

**Design Philosophy:** *Impeccable but simple.* Built for daily stock analyses ahead of earnings, not enterprise-scale deployment. Hybrid approach: start with Notion (weeks 1-2), migrate to custom frontend + PostgreSQL (months 2-3).

---

## Technology Stack

### Runtime & Platform
- **Platform:** Vercel Serverless Functions
- **Runtime:** Node.js 18+
- **Language:** TypeScript 5.3+
- **Build System:** tsc (TypeScript compiler)

### Data Sources
- **Financial Modeling Prep (FMP)** - Stock data, fundamentals, technical indicators
- **FRED API** - Macroeconomic indicators (yield curve, VIX, etc.)
- **Upstash Redis** - Distributed state for rate limiting

### LLM Integration
- **Google Gemini Flash 2.5** (Primary) - Analysis generation, $0.013 per analysis, 50% token reduction
- **LLM Abstraction Layer** - Provider-agnostic interface supporting:
  - Google Gemini (Flash 2.5, Flash 1.5)
  - OpenAI (GPT-4 Turbo, GPT-3.5 Turbo)
  - Anthropic (Claude 3.5 Sonnet, Claude 3 Haiku)
  - Configurable via `LLM_PROVIDER` environment variable
  - Easy provider switching for cost/performance optimization

### Integration Layer
- **Notion API** - Database read/write operations (v1.0.2)
- **PostgreSQL (Supabase)** - Future database (v2.0 migration)
- **REST APIs** - All external communication via HTTP

### Development Tools
- **ESLint** - Code linting
- **ts-node** - Local testing scripts
- **dotenv** - Environment variable management
- **Vercel CLI** - Local development server

## Data Flow Diagram (v1.0.2)

# Stock Analyses Data Flow

```

## 1. Trigger & Input
┌─────────────────┐
│   Web App UI    │  User enters ticker symbol
│  (Frontend)     │  Clicks "Analyze"
└────────┬────────┘
         │
         ▼

## 2. API Request
┌─────────────────────────────────┐
│  Vercel Serverless Function     │
│  (60s timeout on Pro plan)      │
└────────┬────────────────────────┘
         │
         ▼

## 3. Data Ingestion (Parallel)
┌──────────────┐        ┌──────────────┐
│  FMP API     │        │  FRED API    │
│  - Price     │        │  - Macro     │
│  - Volume    │        │  - Economic  │
│  - Technical │        │  - Rates     │
│  - Fundamental        │              │
└──────┬───────┘        └──────┬───────┘
       │                       │
       └───────────┬───────────┘
                   ▼

## 4. LLM Processing
┌─────────────────────────────────┐
│   LLM Abstraction Layer         │
│   (Gemini / Claude / OpenAI)    │
│                                 │
│  Input:                         │
│  - Raw financial metrics        │
│  - Price & volume data          │
│  - Technical indicators         │
│  - Macro context                │
│                                 │
│  Output:                        │
│  - Recommendation               │
│  - Composite scores (0-5)       │
│  - Pattern detection            │
│  - AI summary                   │
│  - Full markdown analysis       │
└────────┬────────────────────────┘
         │
         ▼

## 5. Notion Write (Sequential bottleneck)
┌─────────────────────────────────────────┐
│  Notion API Write                       │
│  (Rate limits: ~3 rps, 100 blocks/call) │
│                                         │
│  Two targets:                           │
│  A) Main Stock Page                     │
│     └─ Overwrite with latest analysis   │
│                                         │
│  B) Stock History Archive               │
│     └─ Create timestamped snapshot      │
│                                         │
│  Operations:                            │
│  1. Update page properties (metadata)   │
│  2. Delete old content blocks           │
│  3. Write new content blocks            │
│     (batched due to size)               │
└────────┬────────────────────────────────┘
         │
         ▼

## 6. Database Update
┌─────────────────────────────────┐
│  Stock Analyses Database        │
│  @Stock Analyses                   │
│                                 │
│  Updated properties:            │
│  - Status: "Complete"           │
│  - All metric columns           │
│  - Scores & ratings             │
│  - Analysis Date                │
│  - API Calls Used               │
└────────┬────────────────────────┘
         │
         ▼

## 7. Response & UI
┌─────────────────────────────────┐
│  Web App Frontend               │
│                                 │
│  - Stop "Analyzing..." spinner  │
│  - Display success              │
│  - "View Results in Notion"     │
│    button (redirects to page)   │
└─────────────────────────────────┘

```

## Data Schema in Notion

```
Each analysis page contains:

├─ Properties (50+ columns in database)
│  ├─ Core: Ticker, Status, Analysis Date
│  ├─ Price: Current, 50/200 MA, 52W High/Low
│  ├─ Scores: Composite, Technical, Fundamental, Macro, Risk, Sentiment, Sector
│  ├─ Indicators: RSI, MACD, Volume, Beta, Volatility
│  ├─ Fundamental: P/E, EPS, Market Cap, Debt/Equity
│  └─ Meta: Confidence, Data Quality Grade, API Calls
│
└─ Page Content (markdown)
├─ Recommendation callout (colored, emoji)
├─ Executive Summary
├─ Technical Analysis
├─ Fundamental Analysis
├─ Macro & Sector Context
├─ Catalysts & Events
├─ Risks & Considerations
├─ Trade Setup (entry/exit/stops in table)
└─ Position Sizing Guidance

```

---

## Architecture Diagram (v1.0.2)

**Current architecture with HTML Analyzer Page and LLM integration**

```
┌──────────────────────────────────────────────────────────────────┐
│                      WordPress (shalomormsby.com)                 │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │             /stock-intelligence (HTML Page)                 │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │ Password-Protected Analyzer UI                        │  │ │
│  │  │ • Ticker Input Field                                  │  │ │
│  │  │ • "Analyze Stock" Button                             │  │ │
│  │  │ • Real-time Status Display                           │  │ │
│  │  │ • Usage Counter (X/10 today)                         │  │ │
│  │  │ • "View Results" Link (on completion)                │  │ │
│  │  │                                                       │  │ │
│  │  │ Tailwind CSS + Vanilla JS (no build step)            │  │ │
│  │  └───────────────────────┬───────────────────────────────┘  │ │
│  └────────────────────────────┼─────────────────────────────────┘ │
└─────────────────────────────┼─────────────────────────────────────┘
                              │
                              │ POST /api/analyze
                              │ { ticker, userId }
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Vercel Serverless (v1.0.2)                  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                      API Endpoints                          │ │
│  │  ┌──────────┐  ┌─────────┐  ┌────────┐  ┌────────────┐   │ │
│  │  │ /analyze │  │ /webhook│  │ /usage │  │  /bypass   │   │ │
│  │  │  (NEW)   │  │ /health │  │        │  │            │   │ │
│  │  └────┬─────┘  └─────────┘  └───┬────┘  └─────┬──────┘   │ │
│  │       │                          │             │           │ │
│  └───────┼──────────────────────────┼─────────────┼───────────┘ │
│          │                          │             │              │
│  ┌───────▼──────────────────────────▼─────────────▼───────────┐ │
│  │                    Core Libraries                           │ │
│  │                                                              │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │ │
│  │  │ Rate Limiter │  │ Scoring      │  │ Notion Client   │  │ │
│  │  │ - Admin      │  │ - 6 Scores   │  │ - Read History  │  │ │
│  │  │   Bypass     │  │ - Technical  │  │ - Write Pages   │  │ │
│  │  │ - Session    │  │ - Fundamental│  │ - Child Pages   │  │ │
│  │  │   Check      │  │ - Macro/Risk │  │ - Archive       │  │ │
│  │  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘  │ │
│  │         │                 │                    │           │ │
│  │  ┌──────▼───────┐  ┌──────▼───────┐  ┌────────▼────────┐  │ │
│  │  │ LLM Provider │  │ FMP Client   │  │ FRED Client    │  │ │
│  │  │ (NEW)        │  │ - Quotes     │  │ - Macro Data   │  │ │
│  │  │ - Gemini     │  │ - Financials │  │ - Indicators   │  │ │
│  │  │ - OpenAI     │  │ - Technicals │  │                │  │ │
│  │  │ - Anthropic  │  └──────────────┘  └─────────────────┘  │ │
│  │  │ - Abstraction│                                         │ │
│  │  └──────┬───────┘                                         │ │
│  │         │                                                  │ │
│  └─────────┼──────────────────────────────────────────────────┘ │
└────────────┼──────────────────────────────────────────────────────┘
             │
    ┌────────┼────────┬──────────────┬──────────────┬────────────┐
    │        │        │              │              │            │
    ▼        ▼        ▼              ▼              ▼            ▼
┌─────────┐ ┌────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐
│ Upstash │ │ Google │ │   FMP    │ │  FRED  │ │  Notion  │ │  Notion  │
│  Redis  │ │ Gemini │ │(Financial│ │ (Macro │ │ Analyses │ │ History  │
│         │ │        │ │   Data)  │ │ Econ)  │ │    DB    │ │    DB    │
│ Rate    │ │ Flash  │ │          │ │        │ │          │ │          │
│ Limit + │ │  2.5   │ │ $22-29/  │ │  Free  │ │ Current  │ │ Archive  │
│ Bypass  │ │        │ │  month   │ │        │ │ Analysis │ │Time-     │
│Sessions │ │ $0.013/│ │          │ │        │ │          │ │Series    │
│         │ │analysis│ │          │ │        │ │          │ │          │
│  Free   │ │(50% ↓) │ │          │ │        │ │          │ │          │
└─────────┘ └────────┘ └──────────┘ └────────┘ └──────────┘ └──────────┘
```

**v1.0.2 Workflow (HTML Page → Vercel → Notion):**
1. User visits WordPress page → enters ticker → clicks "Analyze"
2. HTML page → POST /api/analyze (ticker, userId)
3. Vercel checks rate limit (admin bypass or 10/day)
4. Fetches market data (FMP + FRED in parallel)
5. Calculates 6 category scores + composite
6. Queries Notion for historical analyses (5 most recent)
7. Computes deltas and trends
8. Calls Gemini Flash 2.5 for 7-section analysis (~10-20 sec)
9. Writes to 3 Notion locations:
   - Stock Analyses DB (main page update)
   - Child analysis page (dated, e.g., "AAPL Analysis - Nov 1, 2025")
   - Stock History DB (archive entry)
10. Returns pageUrl → HTML displays "View Results" link
11. User clicks → opens Notion analysis page

**Performance:** 23-42 seconds (Notion bottleneck: historical queries + 3 writes)
**Future:** v2.0 migration to PostgreSQL → 18-25 seconds (10x faster DB ops)

---

## Future Architecture (v2.0)

**Next.js Frontend + PostgreSQL Database for production scale**

```
┌──────────────────────────────────────────────────────────────────┐
│                  Next.js 14 App (Vercel Hosted)                   │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Authentication (Supabase Auth)                            │ │
│  │  • Login / Signup / Password Reset                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Analyzer Page                                             │ │
│  │  • Ticker Input → Real-time Status → Results Display       │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Historical Analysis View                                  │ │
│  │  • List of Past Analyses (sortable, filterable)            │ │
│  │  • Trend Charts (Recharts - score over time)              │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Dashboard                                                 │ │
│  │  • Portfolio Overview                                      │ │
│  │  • Watchlist (track multiple tickers)                      │ │
│  │  • Usage Stats                                             │ │
│  └──────────────────────┬─────────────────────────────────────┘ │
└─────────────────────────┼─────────────────────────────────────────┘
                          │
                          │ Vercel API (same backend, minimal changes)
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Vercel API (v2.0 - PostgreSQL)                   │
│                                                                   │
│  Replace Notion queries with SQL:                                │
│  • Historical query: <500ms (vs 2-5 sec with Notion)              │
│  • Database writes: <100ms (vs 6-10 sec with Notion)              │
│  • Delta computation: Automatic with SQL window functions         │
│                                                                   │
│  Same: Rate limiting, Scoring, LLM generation, FMP/FRED clients   │
└────────────────────────────┬──────────────────────────────────────┘
                             │
                   ┌─────────┼─────────┬───────────┐
                   ▼         ▼         ▼           ▼
            ┌───────────┐ ┌────────┐ ┌──────┐ ┌────────┐
            │ Supabase  │ │ Redis  │ │ LLM  │ │FMP/FRED│
            │PostgreSQL │ │(Rate   │ │      │ │        │
            │           │ │Limit)  │ │      │ │        │
            │ • analyses│ │        │ │      │ │        │
            │ • users   │ │        │ │      │ │        │
            │ • watch-  │ │        │ │      │ │        │
            │   lists   │ │        │ │      │ │        │
            │           │ │        │ │      │ │        │
            │ $0-25/mo  │ │  Free  │ │$39/mo│ │$29/mo  │
            └───────────┘ └────────┘ └──────┘ └────────┘
```

**v2.0 Performance:** 18-25 seconds (60-100x faster DB ops)
**v2.0 Features:** Trend charts, watchlists, portfolio tracking, mobile app
**v2.0 Timeline:** December 2025 - January 2026 (25-35 hours)

---

## Detailed System Flow (v1.0.2)

**Complete end-to-end flow for HTML Analyzer Page with LLM-generated analysis**

### Phase 1: User Authentication & Input

```
┌─────────────────────────────────────────┐
│ User visits shalomormsby.com/           │
│      stock-intelligence                 │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ WordPress Password Gate                 │
│ (Enter password once per session)       │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ HTML Analyzer Page Loads                │
│ • Ticker input field                    │
│ • "Analyze Stock" button                │
│ • userId hardcoded: 90089dd2...         │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ User enters ticker (e.g., "AAPL")       │
│ and clicks "Analyze Stock"              │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ UI State → "Analyzing..."               │
│ (spinner + status message)              │
└──────────────────┬──────────────────────┘
                   │
                   ▼
```

### Phase 2: Vercel Backend Processing

```
┌─────────────────────────────────────────┐
│ POST /api/analyze                       │
│ {                                       │
│   ticker: "AAPL",                       │
│   userId: "user://90089dd2..."          │
│ }                                       │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ 1. Check Rate Limiting                  │
│ • Query Redis for user's daily count    │
│ • Admin bypass: userId == env.ADMIN_ID? │
│ • If limit exceeded → return 429 error  │
│ Time: <500ms                            │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ 2. Fetch Current Market Data            │
│ (Parallel API calls)                    │
│                                         │
│ FMP API:                                │
│ • Daily price data (OHLC)               │
│ • Technical indicators (SMA, RSI, MACD) │
│ • Fundamental data (P/E, EPS, etc.)     │
│                                         │
│ FRED API:                               │
│ • Macro indicators (rates, GDP, etc.)   │
│                                         │
│ Time: ~3-5 seconds                      │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ 3. Calculate Scores                     │
│ • Technical Score (1.0-5.0)             │
│ • Fundamental Score (1.0-5.0)           │
│ • Macro Score (1.0-5.0)                 │
│ • Risk Score (1.0-5.0)                  │
│ • Sentiment Score (1.0-5.0)             │
│ • Sector Score (1.0-5.0)                │
│ • Composite Score (weighted average)    │
│ • Pattern Analysis                      │
│ • Recommendation (Buy/Hold/Sell)        │
│                                         │
│ Time: ~1 second                         │
└──────────────────┬──────────────────────┘
                   │
                   ▼
```

### Phase 3: Historical Context Retrieval

```
┌─────────────────────────────────────────┐
│ 4. Query Notion for Historical Data     │
│ (Parallel queries)                      │
└──────────────────┬──────────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
          ▼                 ▼
┌──────────────────┐  ┌──────────────────┐
│ Query Stock      │  │ Query Stock      │
│ Analyses DB      │  │ History DB       │
│                  │  │                  │
│ Filter:          │  │ Filter:          │
│ Ticker = "AAPL"  │  │ Ticker = "AAPL"  │
│                  │  │ Sort: Date DESC  │
│ Returns:         │  │ Limit: 5         │
│ • Existing page? │  │                  │
│ • Previous scores│  │ Returns:         │
│ • Previous rec   │  │ • Last 5 entries │
│ • Last analysis  │  │ • With dates     │
│   date           │  │ • With scores    │
└────────┬─────────┘  └────────┬─────────┘
         │                     │
         └──────────┬──────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│ 5. Compute Deltas & Trends              │
│                                         │
│ IF previous analysis exists:            │
│ • Score changes: 3.8 → 4.2 (+0.4)       │
│ • Recommendation change: Hold → Buy     │
│ • Days since last analysis: 2 days      │
│                                         │
│ IF historical data exists:              │
│ • Trend direction: Improving ↗          │
│ • Score range: 3.5-4.2 (past 30 days)   │
│ • Average: 3.8                          │
│ • Volatility: Low/Medium/High           │
│                                         │
│ Time: ~2-5 seconds (Notion bottleneck)  │
└──────────────────┬──────────────────────┘
                   │
                   ▼
```

### Phase 4: AI Analysis Generation

```
┌─────────────────────────────────────────┐
│ 6. Build Enriched Prompt for LLM        │
│                                         │
│ Context includes:                       │
│ • Current metrics (all scores)          │
│ • Previous analysis (if exists):        │
│   - Date, scores, recommendation        │
│   - Key metrics that changed            │
│ • Historical trend (past 5 analyses):   │
│   - Dates, scores, recommendations      │
│   - Trend direction                     │
│ • Computed deltas and insights          │
│                                         │
│ Prompt structure:                       │
│ "You are analyzing AAPL on Nov 1, 2025. │
│                                         │
│ Current metrics: [detailed data]        │
│                                         │
│ Previous analysis (Oct 30, 2025):       │
│ - Composite: 3.8 → 4.2 (+0.4)           │
│ - Recommendation: Hold → Buy            │
│ - Key changes: RSI 45→62, MACD crossover│
│                                         │
│ Historical trend (5 analyses):          │
│ - Steady improvement over 30 days       │
│ - Consistent Hold → now upgraded to Buy │
│                                         │
│ Generate 7-section analysis:            │
│ 1. Data Foundation & Quality            │
│ 2. Dual-Lens (Value × Momentum)         │
│ 3. Market Intelligence & Catalysts      │
│ 4. Strategic Trade Plan                 │
│ 5. Directional Outlook                  │
│ 6. Portfolio Integration                │
│ 7. Investment Recommendation            │
│                                         │
│ Highlight changes, trends, and          │
│ what triggered the upgrade."            │
│                                         │
│ NOTE: Prompt optimized for 50% token    │
│ reduction (information-dense format)    │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ 7. Call Google Gemini Flash 2.5 API     │
│                                         │
│ Input: ~1,500-2,500 tokens (50% less)   │
│ Output: ~1,250 tokens (50% less)        │
│                                         │
│ Receives:                               │
│ • Complete 7-section analysis           │
│ • Formatted in Notion markdown          │
│ • Includes H3 headings, bullets         │
│ • Highlights deltas and trends          │
│                                         │
│ Time: ~10-20 seconds                    │
│ Cost: ~$0.013 per analysis              │
│ (vs $0.026 with OpenAI GPT-4)           │
└──────────────────┬──────────────────────┘
                   │
                   ▼
```

### Phase 5: Notion Database Writes

```
┌─────────────────────────────────────────┐
│ 8. Write to Stock Analyses Database     │
│                                         │
│ IF page exists (ticker found):          │
│ • Update existing page properties       │
│ • Update page content with new analysis │
│                                         │
│ IF page doesn't exist:                  │
│ • Create new database row/page          │
│ • Set all properties                    │
│ • Set page content                      │
│                                         │
│ Properties written:                     │
│ • All scores (Composite, Technical, etc)│
│ • Recommendation (Buy/Hold/Sell)        │
│ • Confidence level                      │
│ • Data quality grade                    │
│ • Analysis Date (with timestamp)        │
│ • Pattern scores & signals              │
│ • All technical metrics                 │
│ • All fundamental metrics               │
│                                         │
│ Content written:                        │
│ • Full 7-section analysis text          │
│                                         │
│ Returns: pageUrl of Stock Analyses page │
│                                         │
│ Time: ~2-3 seconds                      │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ 9. Create Dated Child Analysis Page     │
│                                         │
│ Structure:                              │
│ Stock Analyses (Database)               │
│ └─ AAPL (row/page from step 8)          │
│    ├─ AAPL Analysis - Nov 1, 2025 ← NEW │
│    ├─ AAPL Analysis - Oct 30, 2025      │
│    └─ ...                               │
│                                         │
│ Page properties:                        │
│ • Title: "{Ticker} Analysis - {Date}"   │
│ • Parent: Stock Analyses AAPL page      │
│                                         │
│ Page content:                           │
│ • Copy of full 7-section analysis       │
│ • All metrics as properties             │
│ • Timestamp                             │
│                                         │
│ Returns: childPageUrl                   │
│                                         │
│ Time: ~2 seconds                        │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ 10. Archive to Stock History Database   │
│                                         │
│ Create new entry:                       │
│ • Name: "AAPL - Nov 1, 2025 4:30 PM"    │
│ • Copy all metrics from analysis        │
│ • Copy full analysis content            │
│ • Set Content Status: "New"             │
│ • Link to Stock Analyses page           │
│                                         │
│ Purpose:                                │
│ • Time-series tracking                  │
│ • Trend analysis data source            │
│ • Historical reference                  │
│                                         │
│ Time: ~2 seconds                        │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ 11. Increment Rate Limit Counter        │
│ • Update Redis: user's daily count + 1  │
│ Time: <500ms                            │
└──────────────────┬──────────────────────┘
                   │
                   ▼
```

### Phase 6: Response & User Notification

```
┌─────────────────────────────────────────┐
│ 12. Return Success Response             │
│                                         │
│ {                                       │
│   success: true,                        │
│   ticker: "AAPL",                       │
│   pageUrl: "[child page URL]",          │
│   stockAnalysesUrl: "[main page URL]",  │
│   analysisDate: "2025-11-01T16:30:00Z", │
│   compositeScore: 4.2,                  │
│   recommendation: "Buy",                │
│   previousScore: 3.8,                   │
│   scoreChange: +0.4,                    │
│   rateLimit: {                          │
│     used: 5,                            │
│     limit: 10,                          │
│     remaining: 5                        │
│   }                                     │
│ }                                       │
│                                         │
│ Total time: ~18-25 seconds (target)     │
│ Actual (with Notion): ~35-50 seconds    │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ 13. Web Page Updates to Success State   │
│                                         │
│ UI displays:                            │
│ • Button: "✓ Analysis Complete" (green) │
│ • Status: "Analysis created in Notion"  │
│ • Score badge: "4.2/5.0 - Buy (+0.4)"   │
│ • Link: "View Results →"                │
│ • Secondary link: "Copy Link" button    │
│ • Usage counter: "5/10 analyses today"  │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ 14. User Clicks "View Results →"        │
└──────────────────┬──────────────────────┘
                   │
                   ▼
```

### Phase 7: User Reviews Analysis in Notion

```
┌─────────────────────────────────────────┐
│ Notion Page Opens: AAPL Analysis        │
│                  Nov 1, 2025            │
│                                         │
│ User sees:                              │
│ • All metric properties in clean layout │
│ • Composite Score: 4.2/5.0              │
│ • Recommendation: Buy                   │
│ • Full 7-section analysis content:      │
│   1. Data Foundation & Quality          │
│      - Shows data completeness          │
│      - Previous: 3.8, Current: 4.2      │
│   2. Dual-Lens Analysis                 │
│      - Value vs Momentum perspective    │
│   3. Market Intelligence                │
│      - Recent news, catalysts           │
│   4. Strategic Trade Plan               │
│      - Entry/exit levels                │
│   5. Directional Outlook                │
│      - Trend improved over 30 days      │
│   6. Portfolio Integration              │
│      - Position sizing guidance         │
│   7. Investment Recommendation          │
│      - Upgraded from Hold to Buy        │
│      - Rationale with delta context     │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ User can also navigate to:              │
│                                         │
│ • Parent AAPL page (database row)       │
│   - See all historical child analyses   │
│   - Quick metrics reference             │
│                                         │
│ • Stock History database                │
│   - Time-series view of all analyses    │
│   - Trend charts (future feature)       │
│                                         │
│ • Stock Analyses database               │
│   - Compare across all tickers          │
│   - Portfolio overview                  │
└─────────────────────────────────────────┘
```

### Error Scenarios

```
┌─────────────────────────────────────────┐
│ Error: Rate Limit Exceeded              │
│                                         │
│ Response:                               │
│ {                                       │
│   success: false,                       │
│   error: {                              │
│     code: "RATE_LIMIT_EXCEEDED",        │
│     message: "Rate limit exceeded"      │
│   },                                    │
│   rateLimit: {                          │
│     used: 10,                           │
│     limit: 10,                          │
│     remaining: 0,                       │
│     resetTime: "2025-11-02T07:00:00Z"   │
│   }                                     │
│ }                                       │
│                                         │
│ Web page displays:                      │
│ "Daily quota of 10 stock analyses       │
│  reached. Resets at midnight Pacific    │
│  Time. Upgrade to paid plan for         │
│  unlimited analyses."                   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Error: API Timeout / Other Error        │
│                                         │
│ Response:                               │
│ {                                       │
│   success: false,                       │
│   error: {                              │
│     code: "ANALYSIS_FAILED",            │
│     message: "[specific error message]" │
│   }                                     │
│ }                                       │
│                                         │
│ Web page displays:                      │
│ "Error: [message]. Please try again."   │
│ Button re-enabled for retry             │
└─────────────────────────────────────────┘
```

### System Performance Summary

```
═══════════════════════════════════════════════════════════
Total Time Breakdown (v1.0.2 with Notion):
═══════════════════════════════════════════════════════════
• Rate limit check: <500ms
• Fetch market data: 3-5 sec
• Calculate scores: 1 sec
• Query historical data (Notion): 2-5 sec ← BOTTLENECK
• Compute deltas: <1 sec
• LLM analysis generation: 10-20 sec
• Notion writes (3 operations): 6-10 sec ← BOTTLENECK
• Rate limit update: <500ms
─────────────────────────────
TOTAL: 23-42 seconds (realistic with Notion)
TARGET: 18-25 seconds (achievable with PostgreSQL in v2.0)

═══════════════════════════════════════════════════════════
Cost Per Analysis:
═══════════════════════════════════════════════════════════
• FMP API calls: $0.001
• Google Gemini Flash 2.5: $0.013 (50% token reduction)
• Vercel compute: ~$0.001
─────────────────────────────
TOTAL: ~$0.015 (~1.5¢) per analysis
(vs $0.028 with OpenAI GPT-4 - 47% savings)

═══════════════════════════════════════════════════════════
Monthly Costs (10 beta users, 100 analyses/day):
═══════════════════════════════════════════════════════════
• Vercel Pro: $20
• FMP API: $29
• Gemini API: $39 (3,000 analyses/month)
• Upstash Redis: $0 (free tier)
─────────────────────────────
TOTAL: $88/month (v1.0.2 with Notion)

Future (v2.0 with PostgreSQL):
• Vercel Pro: $20
• FMP API: $29
• Gemini API: $39
• Supabase: $0-25
─────────────────────────────
TOTAL: $88-113/month
```

---

## Component Structure

### Directory Layout

```
stock-intelligence/
├── api/                      # Vercel serverless function endpoints
│   ├── analyze.ts            # Main analysis endpoint (390 LOC)
│   ├── webhook.ts            # Notion archive webhook (180 LOC)
│   ├── bypass.ts             # Bypass code activation (115 LOC)
│   ├── usage.ts              # Usage tracking endpoint (115 LOC)
│   └── health.ts             # Health check endpoint (25 LOC)
│
├── lib/                      # Core business logic libraries
│   ├── rate-limiter.ts       # Rate limiting + bypass sessions (340 LOC)
│   ├── scoring.ts            # Score calculation algorithms (850 LOC)
│   ├── notion-client.ts      # Notion API wrapper (600 LOC)
│   ├── fmp-client.ts         # FMP API client (400 LOC)
│   ├── fred-client.ts        # FRED API client (150 LOC)
│   ├── errors.ts             # Custom error classes (180 LOC)
│   ├── logger.ts             # Logging utilities (80 LOC)
│   ├── validators.ts         # Input validation (120 LOC)
│   ├── utils.ts              # Helper functions (100 LOC)
│   ├── auth.ts               # Authentication helpers (60 LOC)
│   └── notion-poller.ts      # Notion polling logic (200 LOC)
│
├── config/                   # Configuration schemas
│   ├── scoring-config.ts     # Scoring weights and thresholds
│   └── notion-schema.ts      # Notion database property mappings
│
├── scripts/                  # Testing and utility scripts
│   ├── test-analyze.ts       # Local analysis testing (240 LOC)
│   ├── test-notion-write.ts  # Notion write testing
│   └── poll-notion.ts        # Manual polling script
│
├── docs/                     # Documentation
│   ├── RATE_LIMITING_SETUP.md
│   ├── USER_SETTINGS_PHASE1.md
│   ├── PHASE1_QUICKSTART.md
│   ├── NOTION_DATABASE_TEMPLATE.md
│   └── PHASE1_WEBHOOK_UPDATE.md
│
├── vercel.json               # Vercel configuration (CORS, timeouts)
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── .env.v1.example           # Environment variable template
└── SETUP.md                  # Setup and deployment guide
```

### Core Components

#### 1. API Layer (`/api`)
**Purpose:** Serverless function endpoints exposed via Vercel

**Key Files:**
- `analyze.ts` - Main analysis orchestrator
  - Validates input
  - Checks rate limits
  - Fetches financial data
  - Calculates scores
  - Writes to Notion
  - Returns results + rate limit info

- `webhook.ts` - Notion automation trigger for archiving
  - Receives page data from Notion
  - Moves analysis to Stock History database
  - Updates status flags

- `bypass.ts` - Bypass code activation
  - Accepts URL params or JSON body
  - Validates bypass code
  - Creates Redis session (expires midnight UTC)

- `usage.ts` - Usage tracking (no quota consumption)
  - Returns current usage count
  - Shows remaining analyses
  - Indicates bypass status

#### 2. Business Logic Layer (`/lib`)
**Purpose:** Reusable, testable business logic

**Key Files:**
- `rate-limiter.ts` - Rate limiting engine
  - Redis key management (`rate_limit:{userId}:{date}`)
  - Bypass session management (`bypass_session:{userId}`)
  - TTL-based expiry (automatic midnight UTC reset)
  - Graceful degradation on Redis failure

- `scoring.ts` - Scoring algorithms
  - Technical score calculation (0-100)
  - Fundamental score calculation (0-100)
  - Composite score weighting
  - Pattern matching logic

- `notion-client.ts` - Notion API wrapper
  - Page read operations
  - Property updates (batch writes)
  - AI prompt execution
  - Database queries

- `fmp-client.ts` - Financial data fetching
  - Real-time quotes
  - Financial statements
  - Technical indicators
  - Profile/company info

- `fred-client.ts` - Macro data fetching
  - Yield curve (DGS10, DGS2)
  - VIX volatility index
  - Economic indicators

- `errors.ts` - Custom error classes
  - `SageStocksError` (base class)
  - `RateLimitError` (429 status)
  - `ValidationError` (400 status)
  - `NotionError` (Notion API failures)
  - User-friendly error messages

#### 3. Configuration Layer (`/config`)
**Purpose:** Centralized configuration schemas

- `scoring-config.ts` - Scoring weights, thresholds, boundaries
- `notion-schema.ts` - Database property name mappings

---

## Data Flow

### Primary Analysis Flow

```
1. User Action (Notion)
   └─▶ Set "Request Analysis" = true in Stock Analyses database

2. Notion Automation
   └─▶ Trigger webhook: POST /api/webhook
       Body: { ticker, pageId, userId, ... }

3. Rate Limit Check
   └─▶ RateLimiter.checkAndIncrement(userId)
       ├─▶ Check bypass session (Redis)
       ├─▶ Check current count (Redis)
       └─▶ Allow or reject (429 error)

4. Data Fetching (Parallel)
   ├─▶ FMP Client: Quote, financials, technicals
   ├─▶ FRED Client: Macro indicators
   └─▶ Wait for all responses

5. Score Calculation
   ├─▶ Calculate technical score (0-100)
   ├─▶ Calculate fundamental score (0-100)
   ├─▶ Calculate composite score (weighted)
   └─▶ Detect patterns (breakout, reversal, etc.)

6. Notion Write
   ├─▶ Update page properties (batch write)
   ├─▶ Trigger AI analysis prompt
   └─▶ Set "Request Analysis" = false

7. Response
   └─▶ Return JSON with scores + rate limit info
```

### Bypass Code Flow

```
1. User Input
   └─▶ GET /api/bypass?userId=XXX&code=YYY
       (Or POST with JSON body)

2. Code Validation
   ├─▶ Extract code from URL params or body
   ├─▶ Compare to env var (RATE_LIMIT_BYPASS_CODE)
   └─▶ Accept or reject

3. Session Creation
   └─▶ Redis SET bypass_session:{userId} = "1"
       EXPIREAT = next_midnight_UTC

4. Future Requests
   └─▶ RateLimiter checks session first
       If exists → unlimited access
       If expired → normal rate limiting
```

### Usage Check Flow

```
1. User Request
   └─▶ GET /api/usage?userId=XXX

2. Bypass Check
   ├─▶ Check Redis for active session
   └─▶ If bypassed → return { remaining: 999 }

3. Normal Count
   ├─▶ GET rate_limit:{userId}:{date}
   └─▶ Return { used: N, remaining: 10-N }

4. Response
   └─▶ JSON with usage data (no quota consumed)
```

---

## API Endpoints

### `/api/analyze` (POST)
**Purpose:** Execute stock analysis and return results

**Request:**
```json
{
  "ticker": "AAPL",
  "userId": "user-123",
  "pageId": "notion-page-id-xyz" (optional)
}
```

**Response (200):**
```json
{
  "success": true,
  "ticker": "AAPL",
  "compositeScore": 72.5,
  "technicalScore": 68.0,
  "fundamentalScore": 77.0,
  "recommendation": "HOLD",
  "pattern": "CONSOLIDATION",
  "metrics": { /* full data object */ },
  "rateLimit": {
    "remaining": 7,
    "total": 10,
    "resetAt": "2025-11-01T00:00:00.000Z",
    "bypassed": false
  }
}
```

**Response (429 - Rate Limit):**
```json
{
  "success": false,
  "error": {
    "code": "USER_RATE_LIMIT_EXCEEDED",
    "message": "Daily analysis limit reached. Your limit will reset at Oct 31, 11:59 PM PT.",
    "statusCode": 429
  }
}
```

**Headers:**
- `X-RateLimit-Remaining` - Analyses remaining
- `X-RateLimit-Total` - Total daily limit
- `X-RateLimit-Reset` - ISO 8601 reset timestamp

**Configuration:**
- Timeout: 300 seconds (5 minutes)
- CORS: Enabled (all origins)

---

### `/api/bypass` (GET/POST)
**Purpose:** Activate bypass code for unlimited analyses

**Method 1: URL Parameters (GET)**
```bash
GET /api/bypass?userId=user-123&code=secret-bypass-code
```

**Method 2: JSON Body (POST)**
```json
POST /api/bypass
{
  "userId": "user-123",
  "code": "secret-bypass-code"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Bypass code activated successfully",
  "expiresAt": "2025-11-01T00:00:00.000Z"
}
```

**Response (400 - Invalid Code):**
```json
{
  "success": false,
  "error": "Invalid bypass code"
}
```

**Configuration:**
- Timeout: 60 seconds (default)
- Session expires: Midnight UTC

---

### `/api/usage` (GET)
**Purpose:** Check current usage without consuming quota

**Request:**
```bash
GET /api/usage?userId=user-123
```

**Response (200):**
```json
{
  "success": true,
  "usage": {
    "used": 3,
    "remaining": 7,
    "total": 10,
    "resetAt": "2025-11-01T00:00:00.000Z",
    "bypassed": false
  }
}
```

**Response (Bypassed):**
```json
{
  "success": true,
  "usage": {
    "used": 0,
    "remaining": 999,
    "total": 10,
    "resetAt": "2025-11-01T00:00:00.000Z",
    "bypassed": true
  }
}
```

---

### `/api/webhook` (POST)
**Purpose:** Notion automation trigger for archiving

**Request:**
```json
{
  "ticker": "AAPL",
  "pageId": "notion-page-id-xyz",
  "action": "archive"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Page archived successfully"
}
```

**Configuration:**
- Timeout: 60 seconds
- Called by: Notion automation ("Send to History" button)

---

### `/api/health` (GET)
**Purpose:** Health check endpoint

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2025-10-31T12:00:00.000Z",
  "version": "1.0.0-beta.1"
}
```

**Configuration:**
- Timeout: 10 seconds
- No authentication required

---

## External Integrations

### 1. Upstash Redis
**Purpose:** Distributed state for rate limiting

**Connection:**
- REST API (no TCP connections)
- Endpoint: `UPSTASH_REDIS_REST_URL`
- Auth: Bearer token (`UPSTASH_REDIS_REST_TOKEN`)

**Data Stored:**
- Rate limit counters: `rate_limit:{userId}:{YYYY-MM-DD}`
- Bypass sessions: `bypass_session:{userId}`

**Commands Used:**
- `GET` - Retrieve count/session
- `INCR` - Increment counter
- `EXPIREAT` - Set TTL to midnight UTC
- `SET` + `EXPIREAT` - Create session with expiry

**Free Tier Limits:**
- 10,000 commands per day
- 256 MB storage
- Automatic eviction (LRU)

**Failure Handling:**
- Graceful degradation (fails open)
- Logs error but allows request
- No Redis = no rate limiting (intentional)

---

### 2. Financial Modeling Prep (FMP)
**Purpose:** Stock data provider

**Endpoint:** `https://financialmodelingprep.com/api/v3/`

**Data Fetched:**
- Real-time quotes (`/quote/{ticker}`)
- Financial statements (`/income-statement/{ticker}`)
- Balance sheets (`/balance-sheet-statement/{ticker}`)
- Technical indicators (`/technical_indicator/daily/{ticker}`)
- Company profile (`/profile/{ticker}`)

**Pricing:**
- Starter: $22/month
- Professional: $29/month (current plan)

**Rate Limits:**
- 250 requests per minute
- 10,000 requests per day

**Error Handling:**
- Retry with exponential backoff
- Custom `APIResponseError` class
- Logs all API failures

---

### 3. FRED API (Federal Reserve Economic Data)
**Purpose:** Macroeconomic indicators

**Endpoint:** `https://api.stlouisfed.org/fred/series/observations`

**Data Fetched:**
- 10-Year Treasury Yield (`DGS10`)
- 2-Year Treasury Yield (`DGS2`)
- VIX Volatility Index (`VIXCLS`)
- Unemployment Rate (`UNRATE`)

**Pricing:** Free (public API)

**Rate Limits:**
- 120 requests per minute
- No daily limit

**Error Handling:**
- Falls back gracefully on failure
- Macros are optional for analysis

---

### 4. Notion API
**Purpose:** Database integration and UI

**Connection:**
- Official SDK: `@notionhq/client`
- Auth: Integration token (`NOTION_API_TOKEN`)

**Operations:**
- Read pages (`pages.retrieve`)
- Update properties (`pages.update`)
- Query databases (`databases.query`)
- Execute AI prompts (via page comments)

**Databases Used:**
- **Stock Analyses** - Active analysis workspace
  - Ticker (title)
  - Request Analysis (checkbox)
  - Composite Score (number)
  - Technical Score (number)
  - Fundamental Score (number)
  - Recommendation (select)
  - Pattern (select)
  - Last Updated (date)
  - Content Status (select)

- **Stock History** - Archive of past analyses
  - Same schema as Stock Analyses
  - Read-only for user

**Rate Limits:**
- 3 requests per second (per integration)
- Retry-After header respected

**Error Handling:**
- Exponential backoff on 429 errors
- Custom `NotionError` class
- Detailed logging

---

## Rate Limiting Architecture

### Design Goals
1. **User-level quotas** - 10 analyses per user per day
2. **Distributed state** - Works across serverless instances
3. **Automatic reset** - Midnight UTC daily reset
4. **Bypass mechanism** - Session-based unlimited access
5. **Graceful degradation** - Fails open if Redis unavailable

### Implementation

#### Redis Key Schema
```
rate_limit:{userId}:{YYYY-MM-DD}     # Daily counter
  - Value: Integer (0-10)
  - TTL: Expires at midnight UTC
  - Commands: INCR, GET, EXPIREAT

bypass_session:{userId}              # Bypass session
  - Value: "1" (existence check only)
  - TTL: Expires at midnight UTC
  - Commands: SET, GET, EXPIREAT
```

#### Rate Limit Check Algorithm
```typescript
async checkAndIncrement(userId: string): Promise<RateLimitResult> {
  // Priority 1: Check for active bypass session
  if (await hasActiveBypass(userId)) {
    return { allowed: true, remaining: 999, bypassed: true };
  }

  // Priority 2: Check if rate limiting is disabled (dev mode)
  if (!this.enabled) {
    return { allowed: true, remaining: 999, bypassed: false };
  }

  // Priority 3: Normal rate limiting
  const key = getRateLimitKey(userId);  // rate_limit:user-123:2025-10-31
  const count = await getCount(key);     // GET from Redis

  if (count >= maxAnalyses) {
    return { allowed: false, remaining: 0 };
  }

  // Increment counter and set expiry
  await increment(key, resetAt);         // INCR + EXPIREAT
  return { allowed: true, remaining: maxAnalyses - (count + 1) };
}
```

#### Bypass Code Activation
```typescript
async activateBypass(userId: string, code: string): Promise<boolean> {
  // Validate code against environment variable
  if (code !== process.env.RATE_LIMIT_BYPASS_CODE) {
    return false;
  }

  // Create session with expiry at midnight UTC
  const key = `bypass_session:${userId}`;
  const midnight = getNextMidnightUTC();

  await redis.set(key, "1");
  await redis.expireat(key, Math.floor(midnight.getTime() / 1000));

  return true;
}
```

#### Midnight UTC Reset
```typescript
function getNextMidnightUTC(): Date {
  const now = new Date();
  const tomorrow = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0, 0
    )
  );
  return tomorrow;
}
```

### Configuration
```bash
# Enable/disable rate limiting
RATE_LIMIT_ENABLED=true

# Daily quota per user
RATE_LIMIT_MAX_ANALYSES=10

# Bypass code (change to revoke all sessions)
RATE_LIMIT_BYPASS_CODE=your-secret-code

# Upstash Redis connection
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token
```

### Error Handling

**Scenario 1: Redis unavailable**
```typescript
try {
  // Attempt rate limit check
} catch (error) {
  log(LogLevel.ERROR, 'Redis connection failed', { error });
  // Fail open - allow request
  return { allowed: true, remaining: 999 };
}
```

**Scenario 2: Rate limit exceeded**
```typescript
if (!rateLimitResult.allowed) {
  throw new RateLimitError(rateLimitResult.resetAt);
  // Returns 429 status with user-friendly message
}
```

**Scenario 3: Invalid bypass code**
```typescript
if (code !== expectedCode) {
  return res.status(400).json({
    success: false,
    error: 'Invalid bypass code'
  });
}
```

---

## Security Model

### Authentication
**Current:** API key-based (lightweight)
- Notion webhook sends API key in header
- Environment variable: `API_KEY`
- Validated in `lib/auth.ts`

**User Identification:**
- `userId` extracted from request
- Notion page properties or query params
- Used for rate limiting and tracking

### Authorization
**Rate Limiting:** Primary access control mechanism
- 10 analyses per user per day
- Bypass code for admin/beta testers
- No payment or subscription system (yet)

**Notion Integration:**
- Integration token stored in environment
- Scoped to specific workspace
- No user credentials stored

### Secrets Management
**Vercel Environment Variables:**
- API keys (FMP, FRED, Notion)
- Redis credentials (Upstash)
- Bypass code
- All secrets encrypted at rest

**Local Development:**
- `.env` file (gitignored)
- `.env.v1.example` template provided
- Secrets never committed to git

### Input Validation
**Ticker Symbols:**
- Alphanumeric + hyphen only
- Max length: 10 characters
- Uppercase normalization

**User IDs:**
- Alphanumeric + hyphen + underscore
- Max length: 100 characters
- Required for rate limiting

**Request Bodies:**
- JSON schema validation
- Type checking via TypeScript
- Zod schemas (optional validation)

### CORS Configuration
**Allowed Origins:** `*` (public API)
**Allowed Methods:** `GET, POST, OPTIONS`
**Allowed Headers:** `Content-Type, Authorization, X-API-Key`

**Rationale:** Personal tool, not sensitive data

### Error Handling
**User-Facing Errors:**
- No stack traces exposed
- Generic error messages
- HTTP status codes (400, 429, 500)

**Internal Logging:**
- Full error details logged
- Vercel logging dashboard
- No PII in logs

---

## Deployment Architecture

### Platform: Vercel Serverless

**Function Configuration:**
```json
{
  "functions": {
    "api/analyze.ts": { "maxDuration": 300 },  // 5 minutes
    "api/webhook.ts": { "maxDuration": 60 },    // 1 minute
    "api/health.ts": { "maxDuration": 10 }      // 10 seconds
  }
}
```

**Build Process:**
1. TypeScript compilation (`tsc --noEmit` for type checking)
2. Vercel packages functions automatically
3. Deploy to edge network (global CDN)

**Cold Start Optimization:**
- Minimal dependencies
- Lazy loading of heavy libraries
- Connection pooling avoided (Redis REST API)

### CI/CD Pipeline

**GitHub Integration:**
```
1. Push to main branch (GitHub Desktop or CLI)
   └─▶ Triggers Vercel deployment

2. Vercel Build
   ├─▶ Install dependencies (npm install)
   ├─▶ Type check (npm run type-check)
   ├─▶ Package functions
   └─▶ Deploy to production

3. Deployment Complete (~30-60 seconds)
   └─▶ Health check automatically validates
```

**Rollback:**
- Vercel dashboard allows instant rollback
- Each deployment preserved for 30 days
- Git history allows code-level rollback

### Environment Management

**Production (Vercel):**
- All secrets in Vercel dashboard
- Environment variables encrypted
- Accessible only to functions at runtime

**Local Development:**
- `.env` file with dev credentials
- `vercel dev` command for testing
- Test scripts (`npm run test:analyze`)

### Monitoring

**Vercel Dashboard:**
- Function execution logs
- Error rates and stack traces
- Performance metrics (duration, cold starts)
- Rate limit tracking (manual via logs)

**Logging Strategy:**
- `LogLevel.INFO` - Request lifecycle
- `LogLevel.WARN` - Graceful failures (Redis down)
- `LogLevel.ERROR` - Unexpected errors

---

## Configuration

### Environment Variables

```bash
# === Core API Keys ===
NOTION_API_TOKEN=secret_xxxxxxxxxxxxx
FMP_API_KEY=your_fmp_api_key_here
FRED_API_KEY=your_fred_api_key_here

# === Notion Database IDs ===
NOTION_ANALYSES_DB_ID=xxxxxxxxxxxxxxxx
NOTION_HISTORY_DB_ID=xxxxxxxxxxxxxxxx

# === Rate Limiting (Upstash Redis) ===
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_redis_token_here
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_ANALYSES=10
RATE_LIMIT_BYPASS_CODE=your_bypass_code_here

# === Authentication ===
API_KEY=your_api_key_here

# === Optional: Development ===
NODE_ENV=development
LOG_LEVEL=INFO
```

### Scoring Configuration

**File:** `config/scoring-config.ts`

**Weights:**
- Technical Score: 40%
- Fundamental Score: 60%

**Boundaries:**
- Strong Buy: 80-100
- Buy: 70-79
- Hold: 50-69
- Sell: 30-49
- Strong Sell: 0-29

**Customizable:** Edit config file and redeploy

### Notion Schema

**File:** `config/notion-schema.ts`

**Property Mappings:**
- Ticker → Title property
- Scores → Number properties
- Recommendation → Select property
- Pattern → Select property

**Flexible:** Supports custom property names

---

## Design Decisions

### 1. **Serverless Architecture**
**Decision:** Use Vercel serverless functions instead of long-running servers

**Rationale:**
- No server maintenance required
- Auto-scaling (0 to N instances)
- Pay only for usage (~$0/month at current scale)
- Global edge network (low latency)

**Trade-offs:**
- Cold starts (~1-2 seconds)
- No persistent connections (hence Redis REST API)
- Function timeout limits (300 seconds max on Pro)

---

### 2. **Upstash Redis for Rate Limiting**
**Decision:** Use Upstash Redis instead of Vercel KV or Edge Config

**Rationale:**
- Better free tier (10,000 commands vs 1,000 requests)
- REST API perfect for serverless (no TCP connections)
- Built-in TTL expiry (automatic midnight reset)
- Industry-standard Redis commands

**Alternatives Considered:**
- Vercel KV: More expensive, similar features
- Edge Config: Read-only, not suitable for counters
- Database: Too slow, overkill for counters

---

### 3. **Session-Based Bypass Codes**
**Decision:** Store bypass sessions in Redis instead of passing code with every request

**Rationale:**
- Better UX (enter code once, use all day)
- More secure (code not exposed in URLs/logs repeatedly)
- Easy revocation (change environment variable)
- Automatic expiry (midnight UTC)

**Alternatives Considered:**
- Stateless JWT: More complex, harder to revoke
- API key per user: Requires user management system
- No bypass: Blocks admin testing

---

### 4. **TypeScript Over JavaScript**
**Decision:** Use TypeScript for all code

**Rationale:**
- Type safety catches errors at compile time
- Better IDE support (autocomplete, refactoring)
- Self-documenting code (types as documentation)
- Industry standard for production systems

**Trade-offs:**
- Compilation step required
- Slight learning curve

---

### 5. **Notion as Primary UI**
**Decision:** Use Notion databases instead of building custom web UI

**Rationale:**
- User already lives in Notion
- Zero frontend maintenance
- Flexible schema (Notion handles CRUD)
- AI integration built-in (Notion AI)

**Trade-offs:**
- Notion API rate limits (3 req/sec)
- Webhook limitations (discovered in v1.0.1)
- Dependent on third-party platform

---

### 6. **Fail Open on Redis Errors**
**Decision:** Allow requests if Redis is unavailable

**Rationale:**
- Personal tool, not mission-critical
- Better UX than hard failures
- Temporary outages shouldn't block usage

**Alternatives Considered:**
- Fail closed: More secure but worse UX
- Queue requests: Too complex for personal tool

---

### 7. **FMP + FRED Over Polygon/Alpha Vantage**
**Decision:** Consolidated to FMP for stock data + FRED for macros

**Rationale:**
- Single provider simplifies integration
- FMP has all needed data (technical + fundamental)
- FRED is authoritative for macro data (Federal Reserve)
- Cost-effective ($22-29/month vs $200+ for Polygon)

**Previous Stack (v0.x):**
- Polygon + Alpha Vantage + FRED
- More expensive, more API keys to manage

---

### 8. **No Frontend Framework (Yet)**
**Decision:** Backend-only system, Notion for UI

**Rationale:**
- Simplicity (no React/Next.js complexity)
- Faster development (focus on API logic)
- User preference (Notion-native workflow)

**Future Consideration:**
- v1.0.1 exploring Notion-native vs HTML vs Next.js
- Phased validation approach (build simplest first)

---

### 9. **Global CORS (Allow All Origins)**
**Decision:** Allow all origins instead of whitelisting

**Rationale:**
- Public API, not sensitive data
- Simplifies Notion webhook integration
- Personal tool, not enterprise system

**Security Note:**
- Rate limiting provides primary access control
- No user credentials exposed
- All secrets server-side only

---

### 10. **Composite Scoring Model**
**Decision:** Weighted combination of technical + fundamental scores

**Rationale:**
- Balanced view (not just charts, not just financials)
- Customizable weights (60/40 current split)
- Pattern matching adds context (breakout, reversal)

**Alternative Considered:**
- ML-based scoring: Too complex, requires training data
- Single-dimension scoring: Misses important signals

---

## Future Enhancements

### v1.1: Enhanced Analysis Features
- Insider trading analysis (requires FMP Pro upgrade)
- Market regime classification (Risk-On/Risk-Off)
- Sector strength rankings
- Brave Search API for market intelligence

### v2.0: Full Automation
- Scheduled jobs (GitHub Actions/Vercel Cron)
- Autonomous portfolio monitoring
- Intelligent digest notifications
- Historical trend analysis
- Market Context dashboard

### Infrastructure
- Upstash Redis Analytics (monitoring usage patterns)
- Vercel Pro upgrade (300-second timeouts)
- CDN caching for repeated tickers
- WebSocket support for real-time updates

---

## Additional Resources

**Setup Documentation:**
- [SETUP.md](SETUP.md) - Environment setup and deployment
- [TESTING.md](TESTING.md) - Testing procedures and validation
- [ROADMAP.md](ROADMAP.md) - Project roadmap and progress

**Rate Limiting Documentation:**
- [RATE_LIMITING_SETUP.md](RATE_LIMITING_SETUP.md) - Complete Upstash setup guide
- [.env.v1.example](.env.v1.example) - Environment variable template

**User Settings Documentation:**
- [USER_SETTINGS_PHASE1.md](USER_SETTINGS_PHASE1.md) - Notion-native implementation
- [PHASE1_QUICKSTART.md](PHASE1_QUICKSTART.md) - Quick start guide
- [PHASE1_WEBHOOK_UPDATE.md](PHASE1_WEBHOOK_UPDATE.md) - Webhook blocker fix

---

**Questions or Issues?**
Contact: Shalom Ormsby
Project Repository: [GitHub](https://github.com/shalomormsby/stock-intelligence) (if applicable)
