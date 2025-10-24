# Stock Intelligence - Roadmap

**Design Philosophy:** Impeccable but simple. Personal decision-support tool for daily stock analyses ahead of earnings. Not enterprise software.

**Current Version:** v0.2.7

For detailed change history, see [CHANGELOG.md](CHANGELOG.md)

---

## Phase 1: Decision Clarity & Confidence ✅ COMPLETE

**Goal:** Understand and trust the scoring system for better investment decisions.

**Status:** All priorities delivered (v0.2.3 - v0.2.5)

### ✅ Completed

**Priority 1: Scoring Configuration** (v0.2.3)
- Centralized ScoringConfig class with documented thresholds
- Every magic number now has financial/technical justification
- Can explain exactly why any stock scores what it does

**Priority 2: Pattern Validation** (v0.2.4)
- PatternBacktester validates if patterns predict price movements
- Pattern Accuracy (0-100%), Expected vs Actual Move
- Data-driven answer to "Do these patterns work?"

**Priority 3: Comparative Analysis** (v0.2.5)
- StockComparator ranks multiple stocks across 5 dimensions
- Clear buy recommendation with rationale
- `compare_stocks(['NVDA', 'MSFT', 'AMZN'])` - simple CLI usage
- Multi-dimensional rankings: Overall, Value, Momentum, Safety, Fundamentals

### 📋 Backlog

**Pattern Enhancement** (Only if validation shows patterns work)
- Pattern confidence levels (High/Medium/Low)
- Volume confirmation for breakout patterns
- Filter weak signals

---

## Phase 2: Advanced Analysis

*Deferred until Phase 1 complete*

**Potential features:**
- Sector comparison
- Multi-timeframe analysis
- Earnings date tracking

---

## Phase TBD: Infrastructure

**Status:** Deferred - these solve non-problems for 1-3 stocks/day workflow

**Not prioritized:**
- Logging system (print statements work fine for interactive use)
- Rate limiting (nowhere near quota: 1-3 stocks vs 4/day limit)
- Data caching (conflicts with need for fresh earnings data)
- Alert system (manual checks before earnings)
- Async API calls (not a pain point at current volume)

**When these might matter:**
- Scaling to 10+ stocks/day
- Building a hosted SaaS version
- Adding automated monitoring

---

## Success Criteria

**Phase 1 Success Criteria:**
- ✅ Can explain why any stock scores what it does (v0.2.3 - Scoring Config)
- ✅ Know if patterns have predictive value (v0.2.4 - Pattern Backtesting)
- ✅ Can run comparative analysis in seconds (v0.2.5 - StockComparator)
- ✅ Confident in system's recommendations for real money decisions

---

**Version:** 0.2.7
**Last Updated:** October 24, 2025
**Philosophy:** Optimize for insight, not infrastructure
