# Stock Intelligence - Roadmap

**Design Philosophy:** Impeccable but simple. Personal decision-support tool for daily stock analyses ahead of earnings. Not enterprise software.

**Current Version:** v2.5.4

For detailed change history, see [CHANGELOG.md](CHANGELOG.md)

---

## Phase 1: Decision Clarity & Confidence

**Goal:** Understand and trust the scoring system for better investment decisions.

**Time estimate:** 3-4 hours remaining

### 🎯 In Progress

**Comparative Analysis** (3-4 hours)
- Build tool to compare multiple stocks side-by-side
- Answer: "Which stock should I buy?" with ranked table
- Show: Composite score, pattern signal, P/E, risk in one view
- Enable multi-ticker CLI: `python stock_intelligence.py NVDA MSFT AMZN AAPL`

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

**Phase 1 complete when:**
- ✅ Can explain why any stock scores what it does (v2.5.3 - Scoring Config)
- ✅ Know if patterns have predictive value (v2.5.4 - Pattern Backtesting)
- ⏳ Can run comparative analysis in seconds (In Progress)
- ⏳ Confident in system's recommendations for real money decisions

---

**Version:** 2.0
**Last Updated:** October 23, 2025
**Philosophy:** Optimize for insight, not infrastructure
