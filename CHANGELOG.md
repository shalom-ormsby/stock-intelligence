# Changelog

All notable changes to Stock Intelligence will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### v1.0.2: LLM Integration (In Progress)

**Status**: Implementation complete, awaiting testing and deployment

**Implementation Completed** (2025-11-01):
- ✅ LLM abstraction layer with multi-provider support
- ✅ Historical analysis querying and delta computation
- ✅ AI-generated analysis content replacing polling workflow
- ✅ Three-location Notion writes (Stock Analyses, Child Pages, Stock History)
- ✅ Cost tracking and performance metadata

**Remaining Work**:
- Add environment variables (LLM_PROVIDER, LLM_MODEL_NAME, GOOGLE_API_KEY)
- Local testing with Gemini Flash 2.5
- Vercel Pro upgrade (300-second timeout requirement)
- Production deployment and validation
- HTML analyzer page (WordPress integration)

### Added
- **LLM Abstraction Layer** ([lib/llm/](lib/llm/), 1,090 LOC):
  - `LLMProvider` abstract base class for provider-agnostic interface
  - `GeminiProvider` - Google Gemini implementation (primary: gemini-2.5-flash)
  - `ClaudeProvider` - Anthropic Claude implementation (claude-4.5-sonnet-20250622)
  - `OpenAIProvider` - OpenAI implementation (gpt-4.1)
  - `LLMFactory` - Provider factory with environment-based selection
  - `AnalysisContext` and `AnalysisResult` TypeScript interfaces
  - Dynamic model pricing table supporting 15+ models across 3 providers
  - Provider-specific prompt optimization (Gemini, Claude, OpenAI)

- **Historical Context System**:
  - `queryHistoricalAnalyses()` method in NotionClient (queries Stock History DB)
  - Delta computation: score changes, recommendation changes, trend direction
  - 5-analysis lookback window for historical context
  - Graceful handling of first-time analysis (no historical data)

- **Notion Content Writing**:
  - `markdownToBlocks()` - Converts LLM markdown output to Notion blocks
  - `parseRichText()` - Parses **bold** formatting in markdown
  - `writeAnalysisContent()` - Writes LLM content to Notion pages
  - `createChildAnalysisPage()` - Creates dated child pages (e.g., "AAPL Analysis - Nov 1, 2025")

- **Response Metadata**:
  - `llmMetadata` in API response with provider, model, tokens (input/output/total), cost, latency
  - `childAnalysisPageId` field for dated analysis page tracking

### Changed
- **Analysis Workflow** ([api/analyze.ts](api/analyze.ts)):
  - **Before**: 5-step workflow ending with Notion AI polling
  - **After**: 7-step workflow with LLM-generated analysis
    1. Fetch data from FMP (technical + fundamental)
    2. Fetch data from FRED (macroeconomic)
    3. Calculate scores (composite, technical, fundamental, macro, risk, sentiment)
    4. Query historical analyses and compute deltas
    5. Generate AI analysis using LLM
    6. Write analysis to 3 Notion locations
    7. Archive to Stock History with LLM content

- **Removed Dependencies**:
  - Deprecated polling workflow (`waitForAnalysisCompletion`, `usePollingWorkflow` parameter)
  - Removed Notion AI dependency (now uses external LLM providers)

### Technical Specifications
- **Primary LLM**: Google Gemini Flash 2.5 (gemini-2.5-flash)
- **Cost per Analysis**: ~$0.013 (50% reduction vs OpenAI GPT-4: ~$0.026)
- **Token Usage**: ~1,500-2,500 input tokens, ~1,250 output tokens (50% reduction via information-dense prompts)
- **Prompt Engineering**: Provider-specific templates
  - Gemini: Information-dense format
  - Claude: XML-tagged structure
  - OpenAI: System message with structured output
- **Model Switching**: Environment variable configuration (no code changes required)
- **Notion Writes**: 3 locations per analysis
  1. Stock Analyses database row (updates existing)
  2. Child analysis page with dated title (creates new)
  3. Stock History database (archives with LLM content)

### Files Modified
- [lib/llm/types.ts](lib/llm/types.ts) - 50 LOC (Core interfaces)
- [lib/llm/pricing.ts](lib/llm/pricing.ts) - 80 LOC (Dynamic pricing table)
- [lib/llm/LLMProvider.ts](lib/llm/LLMProvider.ts) - 60 LOC (Abstract base class)
- [lib/llm/GeminiProvider.ts](lib/llm/GeminiProvider.ts) - 120 LOC (Gemini implementation)
- [lib/llm/ClaudeProvider.ts](lib/llm/ClaudeProvider.ts) - 120 LOC (Claude implementation)
- [lib/llm/OpenAIProvider.ts](lib/llm/OpenAIProvider.ts) - 120 LOC (OpenAI implementation)
- [lib/llm/LLMFactory.ts](lib/llm/LLMFactory.ts) - 50 LOC (Provider factory)
- [lib/llm/prompts/gemini.ts](lib/llm/prompts/gemini.ts) - 150 LOC (Gemini prompts)
- [lib/llm/prompts/claude.ts](lib/llm/prompts/claude.ts) - 150 LOC (Claude prompts)
- [lib/llm/prompts/openai.ts](lib/llm/prompts/openai.ts) - 150 LOC (OpenAI prompts)
- [lib/notion-client.ts](lib/notion-client.ts) - Added 247 LOC (4 new methods)
- [api/analyze.ts](api/analyze.ts) - Modified ~150 LOC (LLM workflow)

### Dependencies Added
- `@google/generative-ai` v0.24.1 (Google Gemini SDK)
- `@anthropic-ai/sdk` v0.68.0 (Anthropic Claude SDK)
- `openai` v6.7.0 (OpenAI SDK)

### Performance Impact
- **Analysis Duration**: +2-3 seconds (LLM generation: ~1.5-2.5s)
- **Notion API Calls**: +8 calls per analysis
  - Historical query: 1 call
  - Stock Analyses content write: 1 call
  - Child page creation: 2 calls (create + write content)
  - Stock History content write: 1 call
  - Archiving: 3 calls (existing)
- **Total Workflow**: ~8-10 seconds end-to-end (vs 10-15 seconds polling workflow)

### Cost Breakdown (per analysis)
- **FMP API**: 11 calls (~$0.0033)
- **FRED API**: 6 calls (free)
- **LLM (Gemini Flash 2.5)**: ~$0.013
- **Total**: ~$0.016 per analysis
- **Monthly (100 analyses)**: ~$1.60 LLM + ~$0.33 FMP = ~$1.93

### Migration Notes
- **Breaking Changes**: None for API consumers (response schema extended, not changed)
- **Deprecated Fields**: `workflow.pollingCompleted` (always false in v1.0.2)
- **New Fields**: `llmMetadata`, `childAnalysisPageId`
- **Environment Variables Required**:
  ```bash
  LLM_PROVIDER=gemini              # Options: gemini, claude, openai
  LLM_MODEL_NAME=gemini-2.5-flash  # Model identifier
  GOOGLE_API_KEY=your_key_here     # Provider API key
  ```

### Next Steps (v1.0.3 - Infrastructure Upgrade)
- Vercel Pro upgrade ($20/month for 300-second timeout)
- HTML analyzer page deployment (WordPress)
- Rate limit adjustment for LLM costs

---

### v1.0: Testing & Beta Launch (In Progress)

**Remaining Work** (~20% of v1.0 scope):
- Notion write verification (ensure all properties write correctly)
- Production hardening (additional retry logic enhancements)
- End-to-end testing with diverse tickers
- Performance optimization (cold starts, caching)
- Beta preparation (onboarding package, user management, feedback system)
- Beta rollout (3 cohorts: Nov 20, Nov 24, Nov 27 targets)

**Completed** (v1.0-alpha):
- ✅ Core API endpoints with FMP + FRED integration
- ✅ Notion polling system for user-triggered analysis
- ✅ Public API access with CORS support
- ✅ Optional authentication system
- ✅ Extended timeouts for long-running operations
- ✅ Health check endpoint for monitoring
- ✅ Comprehensive documentation and testing tools

---

## [1.0-alpha] - 2025-10-29

### Changed
- **Complete architectural migration from Python/Colab to TypeScript/Vercel serverless**
  - Ported ~2,500 LOC of scoring logic from v0.3 Python codebase
  - Rebuilt as production-ready serverless functions on Vercel
  - **Why**: Colab was manual workflow, needed automation for multi-user beta testing
  - **Why TypeScript**: Type safety + Vercel native integration + better maintainability
  - **Why FMP**: Consolidated API (FMP + FRED) replaced fragmented v0.x providers

### Added
- **Notion Polling System (User-Triggered Analysis)**:
  - `NotionPoller` class ([lib/notion-poller.ts](lib/notion-poller.ts), 340 LOC): Query database for pending requests
  - `queryPendingAnalyses()`: Detects pages with "Request Analysis" checkbox = true
  - `getPageProperties()`: Reads all properties from Stock Analyses pages
  - `markAsProcessing()`: Prevents duplicate analysis of same page
  - `markAsFailed()`: Tracks failed analyses with error messages
  - Built-in rate limiter: Respects Notion's 3 requests/second limit
  - Polling script ([scripts/poll-notion.ts](scripts/poll-notion.ts), 290 LOC): Continuous monitoring
  - Configurable poll interval (default: 30 seconds)
  - Graceful shutdown handling (SIGINT/SIGTERM)
  - Comprehensive polling documentation ([POLLING.md](POLLING.md), 500+ LOC)
  - npm script: `npm run poll` for easy execution
- **Public API Access & Security**:
  - CORS support for cross-origin requests (all origins allowed)
  - OPTIONS method handling for preflight requests
  - Optional API key authentication via `X-API-Key` header or `Authorization: Bearer` token
  - `/api/health` (115 LOC): Public health check endpoint for monitoring
  - Flexible security model: public access in dev, authenticated access in production
  - Extended timeouts: 300s for analysis, 60s for webhooks, 10s for health checks
  - Comprehensive API documentation ([API.md](API.md), 350+ LOC)
  - Deployment guide ([DEPLOYMENT.md](DEPLOYMENT.md), 300+ LOC)
  - Testing script ([scripts/test-api.sh](scripts/test-api.sh), 150+ LOC)
- **API Endpoints**:
  - `/api/analyze` (410 LOC): Stock analysis endpoint with FMP + FRED integration
  - `/api/webhook` (190 LOC): Archive endpoint for "Send to History" automation
  - `/api/health` (115 LOC): Health check and API information endpoint
- **Modular Architecture**:
  - API fetching logic extracted to separate functions
  - Score calculation refactored to pure functions
  - Notion read/write operations modularized
  - AI prompt execution logic isolated
- **Deployment & DevOps**:
  - Production deployment on Vercel
  - Public API endpoints with CORS enabled
  - Optional API key authentication for production security
  - Environment variable configuration for secrets
  - Authentication middleware ([lib/auth.ts](lib/auth.ts), 70 LOC)
  - Vercel configuration with custom timeouts ([vercel.json](vercel.json))
  - Local test scripts (240 LOC)
  - Comprehensive documentation (SETUP.md, API.md, DEPLOYMENT.md - 1,400+ LOC)

### Testing & Validation
- End-to-end workflow tested: ticker input → analysis → archive
- Security audit completed (API keys, CORS, input validation)
- Production validation with MSFT test case
- Performance verified: 3-5 seconds per analysis, 17-21 API calls

### Technical Specifications
- **Stack**: Vercel serverless (TypeScript/Node.js) + FMP API ($22-29/mo) + FRED API (free) + Notion API
- **Performance**: 3-5 second analysis, extended timeouts (300s analyze, 60s webhook, 10s health)
- **Codebase**: ~5,100 lines TypeScript, ~4,300 lines documentation, 27 files total
- **Cost**: $22-29/month (FMP API + Vercel hosting)
- **Security**: Optional API key authentication, CORS enabled, webhook signature verification
- **Polling**: User-triggered analysis via Notion checkbox, 30-second intervals (configurable)

### Data Flow (v1.0 Architecture)
**User-Triggered Workflow (Polling-based):**
1. User checks "Request Analysis" checkbox in Stock Analyses database
2. Polling script (`npm run poll`) detects pending request within ~30 seconds
3. Script marks page as "Processing" to prevent duplicates
4. Script calls POST `/api/analyze` with ticker
5. Vercel function fetches technical/fundamental data (FMP) + macro indicators (FRED)
6. Scores calculated (Composite + Pattern) and written back to Notion
7. Notion AI generates 7-section analysis narrative
8. User clicks "Send to History" → archive to Stock History database

**Webhook Workflow (Notion-triggered):**
1. User triggers Notion automation (e.g., "Send to History" button)
2. Notion automation → POST to `/api/webhook` with page data
3. Webhook handler archives completed analysis to Stock History

**External API Access (Public endpoints):**
1. Client checks API status: GET `/api/health`
2. Client triggers analysis: POST `/api/analyze` with ticker (optional: API key for auth)
3. Response includes all scores, data quality, and performance metrics
4. Results automatically synced to Notion databases

### Migration Notes
- **From**: Python/Colab + Polygon/Alpha Vantage/FRED APIs (manual execution)
- **To**: TypeScript/Vercel + FMP/FRED APIs (automated, production-ready)
- **Breaking Changes**: None for end users (Notion interface unchanged)
- **Scoring Logic**: Preserved from v0.x with identical calculation methods

---

## v0.x: Colab Prototype Releases

*The following versions represent the Python/Colab prototype phase (100% complete)*

## [0.2.9] - 2025-10-28

### Changed
- **Pattern Signal Score Distribution**: Improved `compute_pattern_score()` to fix clustering around 3.0
  - Replaced linear score accumulation with weighted signal accumulation system
  - Implemented non-linear scaling using hyperbolic tangent (tanh) for better score distribution
  - Separate bullish and bearish weight tracking for clearer signal separation
  - Refined pattern weights to reflect true technical significance:
    - Golden/Death Cross: 2.5 (very strong signals)
    - Trend structure: 1.8 (strong signals)
    - Volume surges: 1.5 (moderate-strong signals)
    - MACD crossovers: 1.3 (moderate-strong signals)
    - RSI extremes: 1.0 (moderate signals)
  - S-curve distribution now spreads scores across full 1.0-5.0 range
  - More sensitive scoring in middle range, stable at extremes
  - Better differentiation between neutral, bullish, and bearish patterns

### Technical Details
- Net signal calculation: `bullish_weight - bearish_weight` (typically -5.0 to +5.0)
- Tanh scaling: `tanh(net_signal * 0.5)` produces smooth -1.0 to +1.0 curve
- Final score: `3.0 + (scaled_signal × 2.0)` for full range utilization
- Enhanced documentation with inline comments explaining the mathematical approach

## [0.2.8] - 2025-10-24

### Added
- **Content Status & Notification System**: Automated Notion notifications for fresh data
  - `Content Status` property added to all Notion syncs (Stock Analyses, Stock History, Market Context)
  - Status values: "New" for fresh records, "Updated" for existing page updates
  - Enables Notion database automations to trigger notifications when new analysis arrives
  - Useful for setting up Slack/email alerts when stocks are analyzed

### Changed
- All Notion sync operations now include Content Status field for better automation support

## [0.2.7] - 2025-10-24

### Added
- **Market Analysis**: Holistic market context before analyzing individual stocks
  - `MarketDataCollector` class fetches data from Polygon (indices + sectors), FRED (economic indicators), and Brave Search (news)
  - `MarketRegimeClassifier` determines market regime: Risk-On, Risk-Off, or Transition
  - `SectorAnalyzer` ranks 11 sector ETFs and interprets rotation patterns
  - `NotionMarketSync` syncs market analysis to Notion Market Context database
  - `analyze_market()` convenience function for standalone market analysis
  - US indices: SPY, QQQ, DIA, IWM, VIX with 1-day, 5-day, 1-month, 3-month performance
  - Sector ETFs: XLK, XLF, XLV, XLE, XLI, XLP, XLY, XLU, XLRE, XLC, XLB
  - Economic indicators: Fed Funds Rate, Unemployment, Yield Curve, Consumer Sentiment
  - Market news: Real-time search via Brave Search API

### New Environment Variables
- **BRAVE_API_KEY**: Optional API key for market news search (Brave Search)
- **MARKET_CONTEXT_DB_ID**: Optional database ID for Market Context (add to `.env` to enable sync)

### Features
- Market regime classification based on SPY performance, VIX level, and yield curve
- Risk level assessment: Aggressive, Neutral, or Defensive
- Sector rotation interpretation: identifies cyclical vs defensive leadership
- Beautiful Notion pages with formatted sections: US Market Overview, Sector Rotation, Economic Indicators, Recent News
- Executive summary generation for quick market overview

### Usage
```python
# Full market analysis with Notion sync
analyze_market()

# Programmatic use without printing or syncing
results = analyze_market(print_results=False, sync_to_notion=False)
```

### API Calls Per Analysis
- Polygon: ~16 calls (5 indices + 11 sector ETFs)
- FRED: 4 calls (economic indicators)
- Brave Search: 3 calls (optional, if API key configured)
- Total: ~23 calls (well within rate limits)

## [0.2.6] - 2025-10-24

### Added
- **Notion Comparison Sync**: Automatically save multi-stock comparisons to Notion for historical tracking
  - `NotionComparisonSync` class to handle syncing comparison results
  - Creates timestamped pages in Stock Comparisons database with:
    - Properties: Name, Comparison Date, Tickers, Winner, Best Value, Best Momentum, Safest, Rationale, Composite Scores, Number of Stocks
    - Formatted page content: Rankings tables, recommendation callout, alternative suggestions
  - `sync_to_notion` parameter in `compare_stocks()` (default: True)
  - Automatic fallback with helpful warning if STOCK_COMPARISONS_DB_ID not configured

### New Environment Variable
- **STOCK_COMPARISONS_DB_ID**: Optional database ID for Stock Comparisons (add to `.env` to enable sync)

### Enhanced
- `compare_stocks()` now has 3 output modes:
  1. Print to console (default)
  2. Sync to Notion (default, if database configured)
  3. Return results programmatically (always)

### Configuration
- Made STOCK_COMPARISONS_DB_ID optional - shows warning instead of error if not set
- Updated `.env.example` with new database ID template

### Usage
```python
# Full experience - print + sync to Notion
compare_stocks(['NVDA', 'MSFT', 'AMZN'])

# Programmatic only - no console output, no Notion sync
results = compare_stocks(['AAPL', 'GOOGL'], print_results=False, sync_to_notion=False)
```

## [0.2.5] - 2025-10-23

### Added
- **Comparative Analysis System**: Answer "Which stock should I buy?" with multi-stock comparisons
  - `StockComparator` class for side-by-side stock analysis
  - `compare_stocks()` convenience function for easy multi-stock comparison
  - Multi-dimensional rankings: Overall, Value (P/E), Momentum, Safety, Fundamentals
  - Clear buy recommendation with rationale and alternatives
  - Beautiful formatted output with emoji-enhanced tables

### Rankings Provided
- **Overall**: Ranked by composite score (best investment overall)
- **Value**: Ranked by P/E ratio (best value for money)
- **Momentum**: Ranked by 1-month price change (strongest recent performance)
- **Safety**: Ranked by risk score and volatility (lowest risk)
- **Fundamentals**: Ranked by fundamental score (best financials)

### Recommendation Engine
- Automatically identifies best stock to buy now
- Highlights if top pick is also best value, momentum, or safest
- Suggests alternatives for value investors, momentum traders, or risk-averse buyers
- Includes pattern signals in recommendation rationale

### Usage Examples
```python
# Compare mega-cap tech stocks
compare_stocks(['NVDA', 'MSFT', 'AMZN'])

# Compare quantum computing plays
compare_stocks(['IONQ', 'QBTS', 'QUBT'])

# Get results programmatically
results = compare_stocks(['AAPL', 'GOOGL'], print_results=False)
buy_recommendation = results['recommendation']['buy_now']
```

### Documentation
- **v0.x Feature**: Comparative Analysis complete
- **Decision Clarity & Confidence Features**: All three priorities delivered (Scoring Config, Pattern Validation, Comparative Analysis)

## [0.2.4] - 2025-10-23

### Added
- **Pattern Backtesting System**: Validate if detected patterns actually predict price movements
  - `PatternBacktester` class to test pattern predictions against actual outcomes
  - Pattern Accuracy (0-100%): How well did the pattern predict the move?
  - Expected vs Actual Move: Compare predicted and observed price changes
  - Days to Breakout: How long until pattern resolved?
  - Prediction Correct: Boolean flag for directional accuracy
  - Optional `backtest_patterns` parameter in `analyze_and_sync_to_notion()`
  - Adds 1 additional Polygon API call when enabled (30-day lookback window)

### New Notion Fields (requires manual addition to databases)
- **Pattern Accuracy** (Number): 0-100 accuracy score
- **Expected Move (%)** (Number): Predicted price change percentage
- **Actual Move (%)** (Number): Observed price change percentage
- **Days to Breakout** (Number): Days until pattern resolved
- **Prediction Correct** (Checkbox): True if direction prediction was correct

### Changed
- Main function signature: `analyze_and_sync_to_notion(ticker, backtest_patterns=False)`
- Backtesting is opt-in to avoid extra API calls unless needed

### Documentation
- Added comprehensive docstrings to PatternBacktester class
- Documented backtesting methodology and accuracy scoring logic
- **v0.x Feature**: Pattern Validation implementation complete

## [0.2.3] - 2025-10-23

### Added
- **Centralized Scoring Configuration**: Introduced `ScoringConfig` class with documented rationale for all thresholds
  - All magic numbers now have clear financial/technical justifications
  - Market cap thresholds based on SEC definitions and industry standards
  - P/E ratio ranges based on historical S&P 500 averages (~15-20 long-term)
  - RSI thresholds based on Wilder (1978) technical analysis conventions
  - MACD settings using standard 12-26-9 configuration (Appel, 1979)
  - Macro thresholds based on Fed policy ranges and historical economic data
  - Volatility and beta thresholds for risk assessment
  - Easy to tune scoring strategy by adjusting config values

### Changed
- All scoring methods now reference `ScoringConfig` instead of hardcoded values
- Improved code transparency: every threshold explains "why this number?"
- **100% backward compatible**: All scores produce identical results

### Documentation
- Added inline documentation for every threshold with financial context
- Scoring logic now self-documenting and audit-ready
- **Added Business Source License 1.1**: Allows personal/educational use, restricts commercial competition
  - Automatically converts to MIT License on October 23, 2029
  - Protects commercial interests while remaining community-friendly
- Updated README with clear licensing terms and usage guidelines
- Renamed main file from `stock_intelligence_v0.2.2_secure.py` to `stock_intelligence.py` (version tracked internally)
- **v0.x Features**: Scoring Config completed, Pattern Validation and Comparative Analysis still pending at this point

## [Unreleased - Prior Changes]

### Fixed
- Fixed timestamp bug: Analysis Date now correctly displays in Pacific Time without +1 hour offset in Notion databases

### Changed
- **Roadmap Reorganization**: Updated ROADMAP.md to prioritize decision-making clarity over infrastructure
  - v0.x focus: Scoring Config, Pattern Validation, and Comparative Analysis
  - Deferred logging, caching, and rate limiting (solve non-problems for 1-3 stocks/day workflow)
  - Aligned priorities with actual use case: personal decision-support tool for daily earnings plays

### Documentation
- Added design philosophy to roadmap: "Impeccable but simple. Personal decision-support tool for daily stock analyses ahead of earnings. Not enterprise software."
- Reorganized ROADMAP.md to prioritize decision-making features (Scoring Config, Pattern Validation, Comparative Analysis)

## [0.2.2] - 2025-10-22

### Added
- **Pattern Recognition System**: New scoring dimension for chart patterns
  - Pattern Score (1.0-5.0): Separate from composite score
  - Pattern Signal: Visual emoji indicators (🚀 Extremely Bullish → 🚨 Extremely Bearish)
  - Detected Patterns: Lists all identified chart patterns (Golden/Death Cross, RSI bands, MACD crossovers, volume regimes)
- Single-cell Colab version for streamlined copy-paste workflow

### Fixed
- Notion write logic now properly respects each database's schema
  - Stock Analyses: Ticker is title property (upserts existing rows)
  - Stock History: Ticker is rich_text, Name is title (appends new records)

### Changed
- Composite Score remains unchanged (patterns not double-counted in technical score)

## [0.2.1] - 2025-10-22

### Added
- **Hybrid Dual-API Architecture**: Best-in-class data from multiple sources
  - Polygon.io for technical data (unlimited calls, 15-min delayed)
  - Alpha Vantage for fundamental data (free tier)
  - FRED for macroeconomic data (unchanged)
- **Complete fundamental data coverage**:
  - P/E Ratio
  - EPS (calculated from income statements)
  - Revenue (TTM)
  - Debt-to-Equity ratio
  - Beta

### Changed
- Data completeness improved from 71% (B grade) to 90%+ (A grade)
- Daily capacity increased to 4 stocks/day (up from 3)
- Fundamental scoring now uses all 5 key metrics for accurate valuations

### Technical
- Total API calls per analysis: ~19-21 (Polygon: 8-10, Alpha Vantage: 6, FRED: 5)
- Monthly cost: $29 (Polygon Starter only, Alpha Vantage free tier)

## [0.2.0] - 2025-10-21

### Fixed
- **Critical scoring bug**: Removed hardcoded default values that severely limited accuracy
  - All stocks previously scored between 3.0-3.2 (unrealistic clustering)
  - Sentiment Score and Sector Score were hardcoded to 3.0
  - Beta defaulted to 1.0 instead of returning None when unavailable

### Changed
- **Complete scoring system redesign**: Data-driven 1.0-5.0 range using actual metrics
- Weight redistribution: Technical 30% (+5%), Fundamental 35% (+5%), Macro 20%, Risk 15%
- Removed Sector from weighting (no data source available)
- Sentiment Score now calculated from RSI + volume + momentum (not weighted in composite)

### Improved
- Composite scores now span realistic range (expect 1.5-4.5 instead of 3.0-3.2)
- True differentiation between stocks based on actual performance
- More actionable recommendations

## [0.1.9] - 2025-10-21

### Added
- Migrated to Polygon.io Stocks Starter plan for technical data
  - Unlimited API calls (no daily capacity constraints)
  - 15-minute delayed data (better intraday accuracy)
  - 5 years historical data (vs 2 years previously)
  - Access to minute/second aggregates for granular analysis

### Changed
- Monthly cost reduced to $29 (from $50 for premium Alpha Vantage)
- Unlimited daily analyses (no more 2-3 stock per day limit)

### Known Limitations
- Fundamental data limited on Polygon Starter plan (resolved in v0.2.1)

## [0.1.8] - 2025-10-21

### Fixed
- Stock History sync error: Corrected schema mismatch between databases
- All Notion 400 validation errors
- Execution section restored
- Print statement syntax errors

### Changed
- Updated language from "real-time" to "latest available" to reflect EOD data accurately
- Added comprehensive debug logging
- Protocol version updated to v0.1.8

## [0.1.7] - 2025-10-21

### Added
- Real-time pricing via GLOBAL_QUOTE endpoint
  - Captures actual market prices during trading hours (not previous day's close)
  - Near-real-time accuracy for intraday decisions

### Changed
- API calls increased to 9 per stock (from 8)
- Daily capacity reduced to 2 stocks (from 3) due to additional API call

## [0.1.6] - 2025-10-21

### Added
- Timestamp support: Analysis Date now includes exact time (not just date)
- Pacific Time timezone support (PDT/PST)
- Stock History titles now include time: "TICKER - YYYY-MM-DD HH:MM AM/PM"

### Changed
- ISO-8601 datetime format for all timestamps

## [0.1.5] - 2025-10-21

### Added
- **Dual-Database Architecture**: Historical tracking system
  - Stock Analyses: Current snapshot (updates existing records)
  - Stock History: Time-series archive (new record each run)
- **5 History Views**:
  - All History: Complete analysis table
  - Price Trends: Line chart showing price movement
  - Score Evolution: Composite score tracking over time
  - Volume Analysis: Bar chart for volume patterns
  - By Ticker: Grouped historical view per stock

### Fixed
- Duplicate entry creation in Stock Analyses
- Database sync logic now properly updates existing ticker pages

### Improved
- Historical data enables trend analysis and better entry/exit timing
- Cleaner code organization and error handling

## [0.1.4] - 2025-10-21

### Added
- 50-day and 200-day moving averages
- 52-week high/low tracking
- MACD and MACD Signal lines
- 30-day volatility calculations
- Debt-to-equity ratio
- Beta coefficient

### Improved
- Data completeness tracking
- Error handling for missing API data

## [0.1.3] - 2025-10

### Added
- Protocol version tracking in database
- Data quality grading system (A-D scale)
- Confidence level indicators (High/Medium-High/Medium/Low)

### Improved
- Scoring algorithm refinements
- API efficiency
- Notion property mapping

## [0.1.0] - 2025-10

### Added
- **Complete system redesign** with Master Control Protocol (MCP)
- Multi-API integration: Alpha Vantage + FRED
- Automated Notion database sync
- **Comprehensive 6-category scoring system** (1.0-5.0 scale):
  - Technical Score (25%): RSI, MACD, moving averages
  - Fundamental Score (30%): P/E, revenue, margins
  - Macro Score (20%): Interest rates, inflation, GDP
  - Risk Score (15%): Volatility, debt levels
  - Sentiment Score (5%): Market sentiment indicators
  - Sector Score (5%): Sector relative strength
- Composite Score: Weighted average recommendation
- Recommendation Engine: Strong Buy → Strong Sell ratings
- Google Colab notebook execution environment

### Technical
- 40+ properties tracked per stock
- Daily capacity: 3 complete stock analyses (Alpha Vantage free tier: 25 calls/day)
- FRED macroeconomic data (1000 calls/day)

## [0.0.x] - Prior to 2025-10

### Features
- Basic stock data fetching
- Manual analysis workflow
- Limited API integration
- No automated database sync

---

## Version Naming Convention

### Version Structure
- **v0.x**: Colab Prototype - Python/Colab-based manual analysis (complete)
- **v1.0**: Serverless Migration - TypeScript/Vercel production deployment with beta testing
- **v1.1**: Enhanced Analysis - Insider trading analysis + market regime features
- **v2.0**: Full Automation - Scheduled jobs + historical trends + intelligent notifications

### Semantic Versioning
- **Major version** (e.g., v1.x → v2.x): Architectural changes or major feature sets
- **Minor version** (e.g., v1.0 → v1.1): Feature additions within same architecture
- **Patch version** (e.g., v1.0.1): Bug fixes and refinements

### Architecture Evolution
- **v0.x** (Complete): Python/Colab + Polygon/Alpha Vantage/FRED → Manual execution, single-user
- **v1.0** (70% Complete): TypeScript/Vercel + FMP/FRED → Serverless automation, beta testing
- **v1.1** (Planned): Enhanced analysis features (insider trading, market regime classification)
- **v2.0** (Planned): Full autonomous monitoring with scheduled jobs and notifications

### Key Architectural Decisions

**Why migrate from Python/Colab to TypeScript/Vercel?**
- Colab required manual execution for each analysis
- Multi-user beta testing needed automated, always-on infrastructure
- Vercel serverless provides production reliability without server management
- TypeScript adds type safety and better maintainability for collaborative development

**Why Financial Modeling Prep (FMP)?**
- Consolidated API: Technical + fundamental data in one provider (vs 3 separate APIs in v0.x)
- Better rate limits: Supports 10+ users without API quota issues
- Cost-effective: $22-29/month vs $50+ for premium tiers of multiple providers
- Reliable data quality: Comparable to Polygon/Alpha Vantage combination

**Why preserve scoring logic across versions?**
- v0.x scoring system was validated and refined over 9 iterations (v0.2.0 - v0.2.9)
- Pattern recognition system (v0.2.2) and backtesting (v0.2.4) proved valuable
- Maintaining scoring consistency ensures historical analyses remain comparable
- Users trained on v0.x scoring can trust v1.0 recommendations
