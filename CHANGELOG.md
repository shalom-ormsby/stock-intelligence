# Changelog

All notable changes to Stock Intelligence will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.5.3] - 2025-10-23

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
- Renamed main file from `stock_intelligence_v2.5.2_secure.py` to `stock_intelligence.py` (version tracked internally)
- **ROADMAP.md updated**: Marked Phase 1.1 (Scoring Config) as completed
  - Removed completed implementation details
  - Updated success metrics to reflect progress
  - Phase 1.2 (Pattern Validation) and 1.3 (Comparative Analysis) remain pending

## [Unreleased - Prior Changes]

### Fixed
- Fixed timestamp bug: Analysis Date now correctly displays in Pacific Time without +1 hour offset in Notion databases

### Changed
- **Roadmap Reorganization**: Updated ROADMAP.md to prioritize decision-making clarity over infrastructure
  - New Phase 1 focuses on: Scoring Config, Pattern Validation, and Comparative Analysis
  - Deferred logging, caching, and rate limiting (solve non-problems for 1-3 stocks/day workflow)
  - Aligned priorities with actual use case: personal decision-support tool for daily earnings plays

### Documentation
- Added design philosophy to roadmap: "Impeccable but simple. Personal decision-support tool for daily stock analyses ahead of earnings. Not enterprise software."

## [2.5.2] - 2025-10-22

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

## [2.5.0] - 2025-10-22

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

## [2.4.1] - 2025-10-21

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

## [2.4.0] - 2025-10-21

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
- Fundamental data limited on Polygon Starter plan (resolved in v2.5)

## [2.3.4] - 2025-10-21

### Fixed
- Stock History sync error: Corrected schema mismatch between databases
- All Notion 400 validation errors
- Execution section restored
- Print statement syntax errors

### Changed
- Updated language from "real-time" to "latest available" to reflect EOD data accurately
- Added comprehensive debug logging
- Protocol version updated to v2.3.4

## [2.3.2] - 2025-10-21

### Added
- Real-time pricing via GLOBAL_QUOTE endpoint
  - Captures actual market prices during trading hours (not previous day's close)
  - Near-real-time accuracy for intraday decisions

### Changed
- API calls increased to 9 per stock (from 8)
- Daily capacity reduced to 2 stocks (from 3) due to additional API call

## [2.3.1] - 2025-10-21

### Added
- Timestamp support: Analysis Date now includes exact time (not just date)
- Pacific Time timezone support (PDT/PST)
- Stock History titles now include time: "TICKER - YYYY-MM-DD HH:MM AM/PM"

### Changed
- ISO-8601 datetime format for all timestamps

## [2.3.0] - 2025-10-21

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

## [2.2.0] - 2025-10-21

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

## [2.1.0] - 2025-10

### Added
- Protocol version tracking in database
- Data quality grading system (A-D scale)
- Confidence level indicators (High/Medium-High/Medium/Low)

### Improved
- Scoring algorithm refinements
- API efficiency
- Notion property mapping

## [2.0.0] - 2025-10

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

## [1.x] - Prior to 2025-10

### Features
- Basic stock data fetching
- Manual analysis workflow
- Limited API integration
- No automated database sync

---

## Version Naming Convention

- **Major version** (e.g., v2.x): Significant architectural changes, new databases, major features
- **Minor version** (e.g., v2.3): Bug fixes, refinements, additional metrics, improvements
- **Patch version** (e.g., v2.3.1): Small fixes and patches
