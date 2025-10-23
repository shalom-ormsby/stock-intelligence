# Stock Intelligence v2.5.3 - Roadmap & Context

## 📋 Project Overview

**Repository:** https://github.com/shalom-ormsby/stock-intelligence

**Description:** Professional-grade stock analysis system with institutional-quality data sources (Polygon.io, Alpha Vantage, FRED) and sophisticated multi-factor scoring. Automatically syncs results to two Notion databases.

**Current Version:** v2.5.2 (Pattern Recognition Update)

**Design Philosophy:** Impeccable but simple. Personal decision-support tool for daily stock analyses ahead of earnings. Not enterprise software.

---

## ✅ What We've Accomplished

### Security Fixes (COMPLETED)
- ✅ Removed all hardcoded API keys from code
- ✅ Implemented environment variable configuration
- ✅ Added .env.example template for users
- ✅ Created .gitignore to protect secrets
- ✅ Rotated all compromised API keys (Polygon, AlphaVantage, FRED, Notion)
- ✅ Cleaned git history (removed secret from commit history)
- ✅ Added dotenv loading to script
- ✅ Successfully published to public GitHub with zero secrets exposed

### Documentation (COMPLETED)
- ✅ Comprehensive README.md with setup instructions
- ✅ Support for multiple .env methods (local, Google Colab, system)
- ✅ Clear troubleshooting section
- ✅ API rate limit documentation
- ✅ Security best practices documented
- ✅ CHANGELOG.md for user-facing updates

### Bug Fixes (COMPLETED)
- ✅ Fixed timestamp bug: Analysis Date now correctly displays in Pacific Time without +1 hour offset

---

## 🆕 v2.5.2 Features

### NEW: Pattern Recognition System
- **Pattern Score (1.0-5.0):** Separate scoring dimension, NOT included in composite
- **Pattern Signal:** Emoji-based (🚀 Extremely Bullish → 🚨 Extremely Bearish)
- **Detected Patterns:** Lists all identified chart patterns (Golden/Death Cross, MACD crossovers, RSI bands, volume regimes)

### Existing Core Features
- **Multi-Factor Scoring:** Technical (30%), Fundamental (35%), Macro (20%), Risk (15%)
- **28 Metrics:** Comprehensive analysis across 6 categories
- **Confidence Scoring:** Data quality assessment with A-D grading
- **Dual Notion Integration:** Stock Analyses (current) + Stock History (historical tracking)
- **Professional Data Sources:** Polygon.io, Alpha Vantage, FRED

---

## 🎯 Revised Implementation Priorities

**Context:** You're making investment decisions with real money. You analyze 1-3 mega-cap stocks daily before earnings. You need synthesis and insight clarity, not infrastructure bloat.

---

## PHASE 1: Decision Clarity & Confidence (HIGH PRIORITY - 6-9 hours)

### 1.1 Scoring Configuration Centralization ⭐ PRIORITY 1 (1-2 hours)

**Why this is Priority #1:** You're making investment decisions with real money. Right now, you have no idea why a stock scores 3.6 vs 3.8. The magic numbers (why is $200B the threshold? why 40-60 RSI?) obscure your ability to trust and tune the system.

**Impact:**
- **Transparency for decision-making** - Understand WHY scores are what they are
- **Easy to adjust** - Tune thresholds based on market conditions
- **Builds confidence** - Trust your recommendations

**Current Issue:**

```python
# Line 476 - Why $200B? Why these specific P/E ranges?
if mcap > 200e9:   points += 3
elif mcap > 10e9:  points += 2

if 10 <= pe <= 25:      points += 2
elif 5 <= pe < 10 or 25 < pe <= 35: points += 1

if 40 <= rsi <= 60:     points += 2  # Why 40-60?
```

**Problems:**
- No documentation of why thresholds were chosen
- Hard to adjust scoring strategy
- Not clear if based on financial theory or arbitrary
- Can't build confidence in the system

**Implementation:**

```python
class ScoringConfig:
    """
    Centralized scoring thresholds and constants.

    All thresholds are based on:
    - Financial industry standards (P/E ratios, debt levels)
    - Technical analysis conventions (RSI overbought/oversold)
    - Economic indicators (Fed policy ranges)
    - Market cap classifications (SEC definitions)

    Adjust these values to customize scoring sensitivity.
    """

    # === MARKET CAP THRESHOLDS ===
    # Based on industry standard classifications
    MARKET_CAP_MEGA = 200e9   # $200B+ = Mega cap (Apple, Microsoft)
    MARKET_CAP_LARGE = 10e9   # $10B+ = Large cap (S&P 500 range)
    MARKET_CAP_MID = 2e9      # $2B+ = Mid cap
    MARKET_CAP_RISK_SAFE = 100e9  # $100B+ for risk assessment

    # === P/E RATIO RANGES ===
    # Based on historical market averages (S&P 500 ~15-20 long-term)
    PE_RATIO_OPTIMAL_MIN = 10    # Below = potentially undervalued
    PE_RATIO_OPTIMAL_MAX = 25    # Above = potentially overvalued
    PE_RATIO_ACCEPTABLE_MIN = 5  # Extreme undervalue territory
    PE_RATIO_ACCEPTABLE_MAX = 35 # Growth stock territory

    # === RSI THRESHOLDS ===
    # Standard technical analysis ranges
    RSI_NEUTRAL_MIN = 40         # Below = oversold bias
    RSI_NEUTRAL_MAX = 60         # Above = overbought bias
    RSI_MODERATE_LOW_MIN = 30    # Classic oversold threshold
    RSI_MODERATE_LOW_MAX = 40
    RSI_MODERATE_HIGH_MIN = 60
    RSI_MODERATE_HIGH_MAX = 70   # Classic overbought threshold
    RSI_SENTIMENT_NEUTRAL_MIN = 45
    RSI_SENTIMENT_NEUTRAL_MAX = 55
    RSI_SENTIMENT_MODERATE_LOW_MIN = 35
    RSI_SENTIMENT_MODERATE_LOW_MAX = 45
    RSI_SENTIMENT_MODERATE_HIGH_MIN = 55
    RSI_SENTIMENT_MODERATE_HIGH_MAX = 65

    # === MACD SETTINGS ===
    MACD_SIGNAL_CONVERGENCE = 0.9  # 90% of signal = near crossover

    # === VOLUME THRESHOLDS ===
    VOLUME_SPIKE_RATIO = 1.2       # 120% of 20-day average = unusual activity
    VOLUME_SURGE_RATIO = 1.5       # 150% = strong surge

    # === PRICE CHANGE THRESHOLDS ===
    PRICE_CHANGE_STRONG = 0.10     # 10%+ monthly gain = strong momentum
    PRICE_CHANGE_POSITIVE = 0.0    # Any gain = positive
    PRICE_CHANGE_MODERATE_1D = 0.02  # 2% daily = moderate move

    # === DEBT RATIOS ===
    # Based on conservative financial health standards
    DEBT_TO_EQUITY_IDEAL = 0.5     # <0.5 = excellent balance sheet
    DEBT_TO_EQUITY_ACCEPTABLE = 1.0  # <1.0 = acceptable leverage

    # === REVENUE THRESHOLDS ===
    REVENUE_SIGNIFICANT = 10e9     # $10B+ TTM = significant enterprise

    # === EPS THRESHOLDS ===
    EPS_STRONG = 5.0               # $5+ = strong profitability
    EPS_POSITIVE = 0.0             # Positive = profitable

    # === MACRO ECONOMIC THRESHOLDS ===
    # Based on Fed policy ranges and historical economic data
    FED_FUNDS_LOW = 2.0            # <2% = accommodative policy
    FED_FUNDS_MODERATE = 4.0       # <4% = neutral territory
    FED_FUNDS_HIGH = 6.0           # <6% = restrictive but not extreme

    UNEMPLOYMENT_HEALTHY = 4.5     # <4.5% = strong labor market
    UNEMPLOYMENT_ACCEPTABLE = 6.0  # <6% = acceptable

    CONSUMER_SENTIMENT_STRONG = 80  # >80 = strong consumer confidence
    CONSUMER_SENTIMENT_MODERATE = 60  # >60 = moderate confidence

    # === VOLATILITY THRESHOLDS ===
    # 30-day volatility (standard deviation of returns)
    VOLATILITY_LOW = 0.02          # <2% = low volatility (blue chip)
    VOLATILITY_MODERATE = 0.05     # <5% = moderate volatility
    VOLATILITY_HIGH = 0.10         # <10% = high but not extreme

    # === BETA THRESHOLDS ===
    # Market correlation (1.0 = moves with market)
    BETA_LOW = 0.8                 # <0.8 = defensive stock
    BETA_MODERATE = 1.2            # <1.2 = moderate correlation


# Usage in StockScorer class
class StockScorer:
    def __init__(self):
        self.config = ScoringConfig()
        # ... existing code ...

    def _score_fundamental(self, fund: dict) -> float:
        points, maxp = 0.0, 0.0
        mcap = fund.get("market_cap")
        if mcap is not None:
            maxp += 3
            if mcap > self.config.MARKET_CAP_MEGA:
                points += 3
            elif mcap > self.config.MARKET_CAP_LARGE:
                points += 2
            elif mcap > self.config.MARKET_CAP_MID:
                points += 1
        # ... rest of scoring ...
```

**Files to modify:**
- Add `ScoringConfig` class at top of file (after imports)
- Update `StockScorer.__init__()` to instantiate config
- Replace all magic numbers in:
  - `_score_technical()`
  - `_score_fundamental()`
  - `_score_macro()`
  - `_score_risk()`
  - `_score_sentiment()`

**Migration path:**
- No database schema changes needed
- Scores remain identical with default config values
- Can be done incrementally (one scoring method at a time)
- Backward compatible with existing data

---

### 1.2 Pattern Accuracy Validation ⭐ PRIORITY 2 (2-3 hours)

**Why:** You added Pattern Score in v2.5.2 but have zero evidence it works. You're showing "MACD Bullish Crossover" and "✋ Neutral" signals without knowing if they predict anything.

**Impact:** Either validates the feature is useful, or reveals it's noise. Either answer is valuable.

**Action: Quick Backtest Script**

```python
class PatternBacktester:
    """Backtest pattern accuracy against historical performance"""

    def __init__(self, polygon_client):
        self.polygon = polygon_client

    def backtest_pattern(self, ticker: str, pattern_name: str,
                         detected_date: str, days_forward: int = 10) -> dict:
        """
        Check if pattern prediction came true

        Args:
            ticker: Stock symbol
            pattern_name: Name of detected pattern
            detected_date: Date pattern was detected (YYYY-MM-DD)
            days_forward: Days to check forward for validation

        Returns:
            dict with accuracy metrics
        """
        # Get historical data
        start_date = detected_date
        end_date = (datetime.fromisoformat(detected_date) +
                   timedelta(days=days_forward)).strftime('%Y-%m-%d')

        aggs = self.polygon.get_aggregates(ticker, start_date, end_date)

        if not aggs or 'results' not in aggs:
            return {'error': 'Could not fetch historical data'}

        prices = [bar['c'] for bar in aggs['results']]

        if len(prices) < 2:
            return {'error': 'Insufficient data'}

        # Calculate actual price movement
        initial_price = prices[0]
        max_price = max(prices)
        min_price = min(prices)
        final_price = prices[-1]

        max_gain = (max_price - initial_price) / initial_price
        max_loss = (min_price - initial_price) / initial_price
        total_return = (final_price - initial_price) / initial_price

        # Determine if pattern prediction was correct
        pattern_expected_direction = self._get_pattern_direction(pattern_name)

        was_correct = False
        if pattern_expected_direction == 'bullish' and total_return > 0.02:
            was_correct = True
        elif pattern_expected_direction == 'bearish' and total_return < -0.02:
            was_correct = True

        return {
            'pattern': pattern_name,
            'expected_direction': pattern_expected_direction,
            'was_correct': was_correct,
            'days_checked': len(prices),
            'initial_price': initial_price,
            'final_price': final_price,
            'total_return': round(total_return * 100, 2),  # percentage
            'max_gain': round(max_gain * 100, 2),
            'max_loss': round(max_loss * 100, 2)
        }

    def _get_pattern_direction(self, pattern_name: str) -> str:
        """Get expected direction for pattern"""
        bullish_patterns = ['Golden Cross', 'MACD Bullish Crossover',
                           'RSI Oversold Recovery', 'Volume Accumulation']
        bearish_patterns = ['Death Cross', 'MACD Bearish Crossover',
                           'RSI Overbought', 'Bearish Volume Dump']

        if pattern_name in bullish_patterns:
            return 'bullish'
        elif pattern_name in bearish_patterns:
            return 'bearish'
        else:
            return 'neutral'
```

**Notion Fields to Add:**
- **Pattern Accuracy** (percentage)
- **Days to Breakout** (number)
- **Expected Move** (percentage)

**Skip:** Pattern confidence levels, volume confirmation, multi-timeframe analysis. Those are premature optimization before you know if basic pattern detection even works.

---

### 1.3 Comparative Analysis Tool ⭐ PRIORITY 3 (3-4 hours)

**Why:** You're analyzing AMZN, MSFT, NVDA, AAPL separately. But your real question is: **"Which one should I buy?"**

**Impact:** This is what you actually need to make decisions. Not more data—better synthesis.

**Action: Stock Comparison Function**

```python
def compare_stocks(tickers: List[str]) -> str:
    """
    Generate markdown comparison table for multiple stocks.

    Queries Notion for latest analyses and ranks by composite score.

    Returns:
        Formatted markdown table with rankings and insights
    """
    results = {}

    for ticker in tickers:
        # Query Notion Stock Analyses for latest entry
        # Or run fresh analysis if needed
        data = collector.collect_all_data(ticker)
        scores = scorer.calculate_scores(data)

        results[ticker] = {
            'composite': scores['composite'],
            'recommendation': scores['recommendation'],
            'pattern_signal': data.get('pattern', {}).get('signal', '—'),
            'pattern_score': scores.get('pattern', 0),
            'pe_ratio': data['fundamental'].get('pe_ratio', 0),
            'risk_score': scores['risk'],
            'current_price': data['technical'].get('current_price', 0)
        }

    # Rank by composite score
    ranked = sorted(results.items(), key=lambda x: x[1]['composite'], reverse=True)

    # Generate markdown output
    output = "📊 Stock Comparison (as of {})\n\n".format(
        datetime.now(PACIFIC_TZ).strftime('%b %d, %Y %I:%M %p %Z')
    )

    # Table header
    output += "Rank | Ticker | Score | Rec        | Pattern | P/E  | Risk\n"
    output += "-----|--------|-------|------------|---------|------|-----\n"

    # Table rows
    for i, (ticker, data) in enumerate(ranked, 1):
        output += f"{i:4} | {ticker:6} | {data['composite']:4.1f} | "
        output += f"{data['recommendation']:10} | {data['pattern_signal']:7} | "
        output += f"{data['pe_ratio']:4.1f} | {data['risk_score']:3.1f}\n"

    # Insights
    best = ranked[0]
    worst = ranked[-1]

    output += f"\n💡 Best Pick: {best[0]} (highest composite: {best[1]['composite']:.1f}, "
    output += f"pattern: {best[1]['pattern_signal']})\n"

    if worst[1]['composite'] < 3.0:
        output += f"⚠️ Avoid: {worst[0]} (lowest score: {worst[1]['composite']:.1f})\n"

    return output


# Example usage:
tickers = ['NVDA', 'MSFT', 'AMZN', 'AAPL']
comparison = compare_stocks(tickers)
print(comparison)
```

**Expected Output:**
```
📊 Stock Comparison (as of Oct 23, 2025 2:30 PM PDT)

Rank | Ticker | Score | Rec        | Pattern | P/E  | Risk
-----|--------|-------|------------|---------|------|-----
1    | NVDA   | 4.2   | Strong Buy | 🚀      | 28.5 | 3.8
2    | MSFT   | 3.9   | Buy        | 📈      | 31.2 | 4.1
3    | AMZN   | 3.6   | Buy        | ✋      | 33.9 | 3.9
4    | AAPL   | 3.4   | Moderate   | 📉      | 29.7 | 4.2

💡 Best Pick: NVDA (highest composite: 4.2, pattern: 🚀)
⚠️ Avoid: AAPL (lowest score: 3.4)
```

**Files to modify:**
- Add `compare_stocks()` function
- Add optional CLI argument for multi-ticker analysis: `python script.py NVDA MSFT AMZN AAPL`

**Skip:** Portfolio-level analytics, sector comparison, alerts. You're not managing a portfolio tracker; you're making tactical buy decisions.

---

## PHASE 2: Pattern Enhancement (ONLY IF Phase 1 Validates Patterns - 3-5 hours)

**Context:** Only pursue these if Phase 1.2 (Pattern Validation) shows patterns have predictive value.

### 2.1 Pattern Confidence Levels

**Why:** Not all pattern detections are equally strong.

**Implementation:**

```python
def compute_pattern_score_with_confidence(tech: dict) -> Tuple[float, str, List[dict]]:
    """
    Enhanced pattern detection with confidence levels

    Returns:
        (pattern_score, pattern_signal, detected_patterns_with_confidence)
    """
    detected = []

    # Example: MACD Crossover with confidence
    macd, sig = tech.get("macd"), tech.get("macd_signal")
    if macd is not None and sig is not None:
        if macd > sig:  # Bullish crossover
            confidence = _calculate_pattern_confidence(
                pattern_type='bullish',
                volume_confirmation=tech.get('volume', 0) > tech.get('avg_volume_20d', 0) * 1.2,
                price_movement=tech.get('price_change_1m', 0),
                volatility=tech.get('volatility_30d', 0)
            )

            detected.append({
                'name': 'MACD Bullish Crossover',
                'confidence': confidence,
                'direction': 'bullish'
            })

    # ... other patterns ...

    return pattern_score, pattern_signal, detected

def _calculate_pattern_confidence(pattern_type: str,
                                  volume_confirmation: bool,
                                  price_movement: float,
                                  volatility: float) -> float:
    """Calculate confidence level for pattern (0.0-1.0)"""
    confidence = 0.5  # Base confidence

    # Volume confirmation adds confidence
    if volume_confirmation:
        confidence += 0.2

    # Price movement aligned with pattern adds confidence
    if pattern_type == 'bullish' and price_movement > 0:
        confidence += 0.15
    elif pattern_type == 'bearish' and price_movement < 0:
        confidence += 0.15

    # Low volatility adds confidence (cleaner pattern)
    if volatility < 0.02:
        confidence += 0.15

    return min(confidence, 1.0)  # Cap at 1.0
```

### 2.2 Volume Confirmation

**Why:** Patterns with volume confirmation are more reliable.

```python
def validate_pattern_with_volume(pattern_info: dict, volume_data: dict) -> bool:
    """Check if volume confirms the pattern"""

    current_volume = volume_data.get('volume', 0)
    avg_volume = volume_data.get('avg_volume_20d', 0)

    if avg_volume == 0:
        return False

    volume_ratio = current_volume / avg_volume

    # Breakout patterns need volume confirmation
    breakout_patterns = ['Golden Cross', 'Death Cross', 'MACD Bullish Crossover', 'MACD Bearish Crossover']

    if pattern_info['name'] in breakout_patterns:
        # Need at least 120% of average volume
        return volume_ratio >= 1.2

    return True  # Other patterns don't require volume confirmation
```

**Add to Notion:**
- **Volume Confirmation** (checkbox)
- **Pattern Confidence** (select: High/Medium/Low)

---

## PHASE TBD: Infrastructure & Nice-to-Haves (Deferred)

**Context:** These were the original Phase 1 priorities but are NOT aligned with your actual workflow. You analyze 1-3 stocks/day interactively. You have 4 stocks/day quota. These solve non-problems.

### Logging System (Deferred)

**Why deferred:** You're running in Colab/terminal interactively. You can see print statements. Logging is enterprise software bloat for a personal tool.

**Original implementation:** Structured logging with log files

**Decision:** Skip entirely unless debugging becomes a problem.

---

### Rate Limit Handling (Deferred)

**Why deferred:** You analyze 1-3 stocks per day. You have 4 stocks/day quota (Alpha Vantage free tier). This is a non-problem.

**Original implementation:** Retry logic, backoff, rate limiting

**Decision:** Skip entirely. Current quota is sufficient.

---

### Data Caching (Deferred)

**Why deferred:** You're analyzing stocks ahead of earnings for decision-making. You want fresh data every time, not 15-minute-old cached data.

**Original implementation:** 15-minute cache with pickle

**Decision:** Skip entirely. Caching conflicts with need for fresh data.

---

### Advanced Features (Deferred to Phase 3+)

- **Sector Comparison** - Interesting but not decision-critical for mega-cap + quantum focus
- **Multi-Timeframe Analysis** - Complexity that doesn't clearly improve decisions
- **Alert System** - You check analyses manually before earnings. Don't need automation.
- **Async API Calls** - Nice optimization but not a pain point at 1-3 stocks/day

---

## 🎯 Success Metrics

### Phase 1 Success Criteria (Week 1: 6-9 hours)
- ✅ Every scoring threshold documented with rationale
- ✅ Can explain why NVDA scored 4.2 vs MSFT 3.9
- ✅ Pattern backtest run on last 10 analyses
- ✅ Know if patterns have predictive value or are noise
- ✅ Can run `compare_stocks(['NVDA', 'MSFT', 'AMZN'])` and get ranked table
- ✅ Comparative analysis becomes part of daily workflow

### Phase 2 Success Criteria (Only If Patterns Validate)
- ✅ Pattern confidence levels assigned
- ✅ Volume confirmation implemented
- ✅ Pattern accuracy tracked in Notion

---

## 🐛 Known Issues

1. **Magic numbers in scoring** - No documentation of why thresholds chosen (Phase 1.1 fixes this)
2. **Pattern detection needs validation** - Patterns detected but accuracy unknown (Phase 1.2 fixes this)
3. **No comparison tool** - Analyzing stocks in isolation, not comparatively (Phase 1.3 fixes this)
4. **No async API calls** - Sequential, could be faster (not a priority for 1-3 stocks/day)
5. **No error recovery** - If one API fails, analysis may be incomplete (not frequent enough to prioritize)

---

## 📚 Resources

### API Documentation
- Polygon.io: https://polygon.io/docs
- Alpha Vantage: https://www.alphavantage.co/documentation/
- FRED: https://fred.stlouisfed.org/docs/api/
- Notion: https://developers.notion.com/

### Technical Indicators
- RSI: https://www.investopedia.com/terms/r/rsi.asp
- MACD: https://www.investopedia.com/terms/m/macd.asp
- Moving Averages: https://www.investopedia.com/terms/m/movingaverage.asp

### Pattern Recognition
- Chart Patterns: https://www.investopedia.com/articles/technical/112601.asp
- Volume Analysis: https://www.investopedia.com/articles/technical/02/010702.asp

---

## 📝 Notes for Implementation

### Code Style
- Use type hints throughout
- Follow existing naming conventions
- Keep functions small and focused
- Add docstrings to all new functions
- Use descriptive variable names

### Git Workflow
- Commit after each feature
- Use descriptive commit messages
- Format: "Add [feature]: [description]"
- Example: "Add scoring config: centralize all magic number thresholds"

### Testing
- Test manually after each change
- Run analysis on 3-5 different stocks
- Verify Notion sync still works
- Verify comparison tool produces accurate rankings

### Documentation
- Update README.md when adding features
- Update CHANGELOG.md with user-facing changes
- Keep IMPROVEMENT_ROADMAP.md updated with progress

---

## 🎊 Summary

**Philosophy Shift:** This roadmap was treating Stock Intelligence like enterprise software. But it's a **personal decision-support tool** for daily earnings plays on mega-caps.

**What Actually Matters:**
1. **Understand your scores** (Scoring Config)
2. **Validate your patterns** (Pattern Backtesting)
3. **Compare your options** (Stock Comparison Tool)

**What Doesn't Matter (Yet):**
- Logging infrastructure
- Rate limiting (you're nowhere near quota)
- Caching (conflicts with need for fresh data)
- Alerts/monitoring (you check manually)

**Bottom Line:** Optimize for **insight**, not infrastructure. Build confidence in your system's recommendations so you can make better investment decisions.

---

**Version:** 2.0
**Created:** October 23, 2025
**Last Updated:** October 23, 2025
**Author:** Revised roadmap prioritizing decision clarity over engineering infrastructure
