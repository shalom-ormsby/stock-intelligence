/**
 * Unified Prompt Builder (Single Source of Truth)
 *
 * All LLM providers use this shared prompt template.
 * This ensures consistency and eliminates 3x maintenance burden.
 *
 * v1.0.3 - Refactored from separate provider-specific prompts
 * v1.0.4 - Optimized for information density and scannability
 */

import { AnalysisContext } from '../types';

/**
 * Build optimized analysis prompt for any LLM provider
 *
 * Targets 1,700-2,000 tokens (down from 6,000) for faster execution
 * and improved scannability while preserving analytical value.
 */
export function buildAnalysisPrompt(context: AnalysisContext): string {
  const { ticker, currentDate, currentMetrics, previousAnalysis, deltas } = context;

  // Determine recommendation badge and callout color
  const { badge, calloutColor } = getRecommendationFormatting(currentMetrics.recommendation);

  let prompt = '';

  // Role and optimization instructions
  prompt += `You are a professional stock analyst. Generate a CONCISE, SCANNABLE analysis for ${ticker}.\n\n`;

  prompt += `**CRITICAL FORMAT RULES:**\n`;
  prompt += `- Use tables for comparisons (entry zones, targets, catalysts)\n`;
  prompt += `- Use bullets for lists (ONE idea per bullet, max 20 words)\n`;
  prompt += `- Use emojis for status: 🔥=critical 🚀=bullish ✅=confirmed ⚠️=risk 📈=uptrend 📉=downtrend ⛔=stop\n`;
  prompt += `- Bold key numbers and insights\n`;
  prompt += `- Lead with insight, not explanation\n`;
  prompt += `- NO fluff, every sentence adds value\n`;
  prompt += `- **TARGET: 1,700-2,000 tokens total**\n\n`;

  // Current metrics context - EXPANDED to include ALL API data (v1.0.6)
  prompt += `## Analysis Context\n\n`;

  // Date and Company Info
  prompt += `**Date:** ${currentDate}\n`;
  prompt += `**Company:** ${currentMetrics.companyName || ticker} (${ticker})`;
  if (currentMetrics.sector || currentMetrics.industry) {
    prompt += ` - ${currentMetrics.sector || ''}${currentMetrics.sector && currentMetrics.industry ? ' / ' : ''}${currentMetrics.industry || ''}`;
  }
  prompt += `\n`;
  if (currentMetrics.marketCap) {
    const mcap = currentMetrics.marketCap;
    const mcapFormatted = mcap >= 1e12 ? `$${(mcap / 1e12).toFixed(2)}T` :
                          mcap >= 1e9 ? `$${(mcap / 1e9).toFixed(2)}B` :
                          mcap >= 1e6 ? `$${(mcap / 1e6).toFixed(2)}M` : `$${mcap.toFixed(0)}`;
    prompt += `**Market Cap:** ${mcapFormatted}`;
    if (currentMetrics.beta != null) {
      prompt += ` | **Beta:** ${currentMetrics.beta.toFixed(2)}`;
    }
    prompt += `\n`;
  }
  prompt += `\n`;

  // Current Price and Range
  if (currentMetrics.currentPrice != null) {
    prompt += `**Current Price:** $${currentMetrics.currentPrice.toFixed(2)}\n`;

    if (currentMetrics.week52Low != null && currentMetrics.week52High != null) {
      const rangePercent = ((currentMetrics.currentPrice - currentMetrics.week52Low) / (currentMetrics.week52High - currentMetrics.week52Low) * 100);
      prompt += `**52-Week Range:** $${currentMetrics.week52Low.toFixed(2)} - $${currentMetrics.week52High.toFixed(2)} (currently at ${rangePercent.toFixed(0)}% of range)\n`;
    }

    if (currentMetrics.ma50 != null) {
      const ma50Diff = ((currentMetrics.currentPrice - currentMetrics.ma50) / currentMetrics.ma50 * 100);
      prompt += `**50-day MA:** $${currentMetrics.ma50.toFixed(2)} (${ma50Diff > 0 ? '+' : ''}${ma50Diff.toFixed(1)}% ${ma50Diff > 0 ? 'above' : 'below'})\n`;
    }

    if (currentMetrics.ma200 != null) {
      const ma200Diff = ((currentMetrics.currentPrice - currentMetrics.ma200) / currentMetrics.ma200 * 100);
      prompt += `**200-day MA:** $${currentMetrics.ma200.toFixed(2)} (${ma200Diff > 0 ? '+' : ''}${ma200Diff.toFixed(1)}% ${ma200Diff > 0 ? 'above' : 'below'})\n`;
    }
    prompt += `\n`;
  }

  // Technical Indicators
  prompt += `**Technical Indicators:**\n`;
  if (currentMetrics.rsi != null) {
    const rsiSignal = currentMetrics.rsi > 70 ? ' (overbought)' : currentMetrics.rsi < 30 ? ' (oversold)' : '';
    prompt += `- RSI: ${currentMetrics.rsi.toFixed(1)}${rsiSignal}\n`;
  }
  if (currentMetrics.volume != null && currentMetrics.avgVolume != null) {
    const volChange = ((currentMetrics.volume - currentMetrics.avgVolume) / currentMetrics.avgVolume * 100);
    const volFormatted = currentMetrics.volume >= 1e9 ? `${(currentMetrics.volume / 1e9).toFixed(1)}B` :
                         currentMetrics.volume >= 1e6 ? `${(currentMetrics.volume / 1e6).toFixed(1)}M` :
                         `${(currentMetrics.volume / 1e3).toFixed(1)}K`;
    const avgVolFormatted = currentMetrics.avgVolume >= 1e9 ? `${(currentMetrics.avgVolume / 1e9).toFixed(1)}B` :
                            currentMetrics.avgVolume >= 1e6 ? `${(currentMetrics.avgVolume / 1e6).toFixed(1)}M` :
                            `${(currentMetrics.avgVolume / 1e3).toFixed(1)}K`;
    prompt += `- Volume: ${volFormatted} (vs ${avgVolFormatted} avg, ${volChange > 0 ? '+' : ''}${volChange.toFixed(1)}%)\n`;
  }
  if (currentMetrics.priceChange1d != null) {
    prompt += `- Price Changes: 1D ${formatPercent(currentMetrics.priceChange1d * 100)}`;
    if (currentMetrics.priceChange5d != null) prompt += ` | 5D ${formatPercent(currentMetrics.priceChange5d * 100)}`;
    if (currentMetrics.priceChange1m != null) prompt += ` | 1M ${formatPercent(currentMetrics.priceChange1m * 100)}`;
    prompt += `\n`;
  }
  if (currentMetrics.volatility30d != null) {
    prompt += `- 30-day Volatility: ${(currentMetrics.volatility30d * 100).toFixed(1)}%\n`;
  }
  prompt += `\n`;

  // Fundamental Metrics
  prompt += `**Fundamentals:**\n`;
  if (currentMetrics.peRatio != null) {
    prompt += `- P/E Ratio: ${currentMetrics.peRatio.toFixed(1)}\n`;
  }
  if (currentMetrics.eps != null) {
    prompt += `- EPS (TTM): $${currentMetrics.eps.toFixed(2)}\n`;
  }
  if (currentMetrics.revenueTTM != null) {
    const rev = currentMetrics.revenueTTM;
    const revFormatted = rev >= 1e12 ? `$${(rev / 1e12).toFixed(2)}T` :
                         rev >= 1e9 ? `$${(rev / 1e9).toFixed(2)}B` :
                         rev >= 1e6 ? `$${(rev / 1e6).toFixed(2)}M` : `$${rev.toFixed(0)}`;
    prompt += `- Revenue (TTM): ${revFormatted}\n`;
  }
  if (currentMetrics.debtToEquity != null) {
    const leverage = currentMetrics.debtToEquity < 0.3 ? ' (low leverage)' :
                     currentMetrics.debtToEquity > 1.0 ? ' (high leverage)' : '';
    prompt += `- Debt/Equity: ${currentMetrics.debtToEquity.toFixed(2)}${leverage}\n`;
  }
  prompt += `\n`;

  // Macro Environment
  prompt += `**Macro Environment:**\n`;
  if (currentMetrics.fedFundsRate != null) {
    prompt += `- Fed Funds Rate: ${currentMetrics.fedFundsRate.toFixed(2)}%\n`;
  }
  if (currentMetrics.unemployment != null) {
    prompt += `- Unemployment: ${currentMetrics.unemployment.toFixed(1)}%\n`;
  }
  if (currentMetrics.vix != null) {
    const vixSignal = currentMetrics.vix > 30 ? ' (high volatility)' : currentMetrics.vix < 15 ? ' (low volatility)' : '';
    prompt += `- VIX: ${currentMetrics.vix.toFixed(1)}${vixSignal}\n`;
  }
  if (currentMetrics.consumerSentiment != null) {
    prompt += `- Consumer Sentiment: ${currentMetrics.consumerSentiment.toFixed(1)}\n`;
  }
  if (currentMetrics.yieldCurveSpread != null) {
    const inverted = currentMetrics.yieldCurveSpread < 0 ? ' (inverted - recession signal)' : '';
    prompt += `- Yield Curve Spread: ${currentMetrics.yieldCurveSpread.toFixed(2)}%${inverted}\n`;
  }
  prompt += `\n`;

  // Scores
  prompt += `**Analysis Scores:**\n`;
  prompt += `- Composite: ${currentMetrics.compositeScore}/5.0 (${currentMetrics.recommendation})\n`;
  prompt += `- Technical: ${currentMetrics.technicalScore}/5.0 | Fundamental: ${currentMetrics.fundamentalScore}/5.0 | Macro: ${currentMetrics.macroScore}/5.0\n`;
  prompt += `- Risk: ${currentMetrics.riskScore}/5.0 | Sentiment: ${currentMetrics.sentimentScore}/5.0\n`;
  prompt += `- Pattern: ${currentMetrics.pattern} | Confidence: ${currentMetrics.confidence}/5.0\n\n`;

  // Delta context (if exists)
  if (previousAnalysis && deltas) {
    prompt += `**Changes Since ${previousAnalysis.date} (${deltas.priceDeltas?.daysElapsed || '?'} days ago):**\n`;
    prompt += `- Score: ${previousAnalysis.compositeScore}/5.0 → ${currentMetrics.compositeScore}/5.0 (${formatDelta(deltas.scoreChange)}, ${deltas.trendDirection})\n`;

    if (deltas.categoryDeltas) {
      prompt += `- Category Δ: Tech ${formatDelta(deltas.categoryDeltas.technical)} | Fund ${formatDelta(deltas.categoryDeltas.fundamental)} | Macro ${formatDelta(deltas.categoryDeltas.macro)}\n`;
    }

    if (deltas.priceDeltas) {
      prompt += `- Price: ${formatPercent(deltas.priceDeltas.priceChangePercent)} | Volume: ${formatPercent(deltas.priceDeltas.volumeChangePercent)}\n`;
      if (deltas.priceDeltas.annualizedReturn) {
        prompt += `- Annualized Return: ${formatPercent(deltas.priceDeltas.annualizedReturn)}\n`;
      }
    }
    prompt += '\n';
  }

  // Data Grounding Rules - CRITICAL to prevent hallucination (v1.0.6)
  prompt += `## CRITICAL: Data Grounding Rules\n\n`;
  prompt += `**You MUST only use the data provided above. Do NOT invent or hallucinate information.**\n\n`;

  if (currentMetrics.currentPrice != null) {
    const minEntry = currentMetrics.currentPrice * 0.90;
    const maxEntry = currentMetrics.currentPrice * 1.10;
    prompt += `**Price Constraints:**\n`;
    prompt += `- Entry zones MUST be within ±10% of current price ($${minEntry.toFixed(2)} - $${maxEntry.toFixed(2)})\n`;
    prompt += `- Use these reference levels for support/resistance:\n`;
    prompt += `  • Current: $${currentMetrics.currentPrice.toFixed(2)}\n`;
    if (currentMetrics.ma50 != null) prompt += `  • 50-day MA: $${currentMetrics.ma50.toFixed(2)}\n`;
    if (currentMetrics.ma200 != null) prompt += `  • 200-day MA: $${currentMetrics.ma200.toFixed(2)}\n`;
    if (currentMetrics.week52High != null) prompt += `  • 52-week high: $${currentMetrics.week52High.toFixed(2)}\n`;
    if (currentMetrics.week52Low != null) prompt += `  • 52-week low: $${currentMetrics.week52Low.toFixed(2)}\n`;
    prompt += `  • Round numbers (e.g., $${Math.round(currentMetrics.currentPrice / 10) * 10}, $${Math.ceil(currentMetrics.currentPrice / 10) * 10})\n`;
  }

  prompt += `\n**Catalyst & Risk Constraints:**\n`;
  prompt += `- Base catalysts on: sector trends (${currentMetrics.sector || 'Technology'}), macro factors (provided above), technical setups\n`;
  prompt += `- Do NOT invent specific earnings dates, product launches, or company events\n`;
  prompt += `- If you need a specific date, say "Check earnings calendar" instead of guessing\n`;
  prompt += `- Risks MUST derive from: P/E ratio, debt levels, beta, sector exposure, macro headwinds (all provided)\n`;

  prompt += `\n**Key Dates:**\n`;
  prompt += `- ONLY mention dates if you have them in the context above\n`;
  prompt += `- Generic placeholders OK: "Next earnings (check Q4 2024 schedule)", "Fed meeting (December 2024)"\n`;
  prompt += `- Do NOT fabricate specific dates\n\n`;

  // Output structure
  prompt += `## Required Output (5 Sections)\n\n`;

  prompt += `### Section 1: Executive Summary (300 tokens max)\n\n`;
  prompt += `Start with a color-coded callout:\n\n`;
  prompt += `<callout icon="${badge}" color="${calloutColor}">\n`;
  prompt += `**${currentMetrics.recommendation.toUpperCase()}** | Entry: [price range] | Target: [price range] | Stop: [price]\n\n`;
  prompt += `### Why Now?\n`;
  prompt += `- [Insight 1: What triggered this setup]\n`;
  prompt += `- [Insight 2: Key catalyst or technical confirmation]\n`;
  prompt += `- [Insight 3: Risk/reward or timing element]\n\n`;
  prompt += `### Key Risks\n`;
  prompt += `⚠️ [Risk 1]\n`;
  prompt += `⚠️ [Risk 2]\n`;
  prompt += `⚠️ [Risk 3]\n\n`;
  prompt += `**What You're Betting On:** [One sentence thesis: company advantage → catalyst → price outcome]\n`;
  prompt += `</callout>\n\n`;

  prompt += `### Section 2: Trade Setup (400 tokens max)\n\n`;
  prompt += `**Entry Zones** (use table):\n\n`;
  prompt += `| Zone | Price | Action | Allocation |\n`;
  prompt += `|------|-------|--------|------------|\n`;
  prompt += `| ✅ [Status] | $X-Y | [Action] | X% |\n`;
  prompt += `| 📉/📈 [Status] | $X | [Condition] | X% |\n`;
  prompt += `| ⛔ Stop loss | $X | [Trigger] | Exit all |\n\n`;

  prompt += `**Profit Targets** (use table):\n\n`;
  prompt += `| Target | Price | Action | Rationale |\n`;
  prompt += `|--------|-------|--------|----------|\n`;
  prompt += `| T1 | $X | Trim X% | [Why this level] |\n`;
  prompt += `| T2 | $X | Trim X% | [Catalyst or resistance] |\n`;
  prompt += `| T3 | $X | Hold X% | [Bull case target] |\n\n`;

  prompt += `**Key Dates** (top 3 only):\n`;
  prompt += `- **[Date]:** [Event] ([impact expectation]) 🔥🔥🔥 [if critical]\n\n`;

  prompt += `### Section 3: Catalysts & Risks (500 tokens max)\n\n`;
  prompt += `**Top 3 Catalysts 🚀**\n\n`;
  prompt += `**1. [Catalyst Name]** 🔥🔥🔥 [if critical]\n`;
  prompt += `- [Key fact 1]\n`;
  prompt += `- [Key fact 2]\n`;
  prompt += `- **Bull scenario:** [outcome + price impact]\n`;
  prompt += `- **Bear scenario:** [outcome + price impact]\n\n`;
  prompt += `[Repeat for 2-3 catalysts]\n\n`;

  prompt += `**Top 3 Risks ⚠️**\n\n`;
  prompt += `**1. [Risk Name]**\n`;
  prompt += `- [Why this matters]\n`;
  prompt += `- **Impact:** [Specific consequence]\n\n`;
  prompt += `[Repeat for 2-3 risks]\n\n`;

  prompt += `### Section 4: Technical Picture (200 tokens max)\n\n`;
  prompt += `**Pattern Score:** ${currentMetrics.pattern} [score/5.0] [emoji if bullish/bearish]\n\n`;
  prompt += `| Indicator | Value | Signal |\n`;
  prompt += `|-----------|-------|--------|\n`;
  prompt += `| Price | $X | [vs resistance/support] |\n`;
  prompt += `| 50-day MA | $X | [above/below, % away] |\n`;
  prompt += `| RSI | X | [interpretation] |\n`;
  prompt += `| Volume | [% change] | [interpretation] |\n\n`;
  prompt += `**Support/Resistance:**\n`;
  prompt += `- Resistance: $X (reason), $Y (reason)\n`;
  prompt += `- Support: $X (reason), $Y (reason)\n\n`;

  prompt += `### Section 5: Position Sizing (300 tokens max)\n\n`;
  prompt += `**Recommended Allocation** (use table):\n\n`;
  prompt += `| Risk Tolerance | Allocation | Notes |\n`;
  prompt += `|----------------|------------|-------|\n`;
  prompt += `| Conservative | X-Y% | [Suggestion] |\n`;
  prompt += `| Moderate | X-Y% | [Suggestion] |\n`;
  prompt += `| Aggressive | X-Y% | [Warning if >15%] |\n\n`;

  prompt += `**Portfolio Considerations:**\n`;
  prompt += `- High correlation with: [List similar holdings/sectors]\n`;
  prompt += `- Diversify with: [Suggestions]\n\n`;

  prompt += `**Re-evaluate if:**\n`;
  prompt += `- [Trigger 1]\n`;
  prompt += `- [Trigger 2]\n`;
  prompt += `- [Trigger 3]\n\n`;

  // Emphasis on delta insights
  if (deltas && deltas.categoryDeltas) {
    prompt += `**IMPORTANT:** Explain what changed and why:\n`;
    prompt += `- Connect category score deltas to specific events or metrics\n`;
    prompt += `- Validate score changes against actual price movement\n`;
    prompt += `- Highlight divergences (e.g., "price up but fundamentals declining")\n\n`;
  }

  prompt += `**TONE:** Direct, confident, actionable. Every word must earn its place.\n`;
  prompt += `**REMEMBER:** 1,700-2,000 tokens total. Information density > word count.\n`;

  return prompt;
}

/**
 * Get recommendation formatting (badge emoji and callout color)
 */
function getRecommendationFormatting(recommendation: string): {
  badge: string;
  calloutColor: string;
} {
  const rec = recommendation.toLowerCase();

  if (rec.includes('strong buy')) {
    return { badge: '🟢', calloutColor: 'green_bg' };
  } else if (rec.includes('buy')) {
    return { badge: '🟢', calloutColor: 'green_bg' };
  } else if (rec.includes('moderate buy')) {
    return { badge: '🟡', calloutColor: 'yellow_bg' };
  } else if (rec.includes('hold')) {
    return { badge: '🟡', calloutColor: 'yellow_bg' };
  } else if (rec.includes('moderate sell')) {
    return { badge: '🟠', calloutColor: 'orange_bg' };
  } else if (rec.includes('sell')) {
    return { badge: '🔴', calloutColor: 'red_bg' };
  } else if (rec.includes('strong sell')) {
    return { badge: '🔴', calloutColor: 'red_bg' };
  }

  // Default to neutral for unknown recommendations
  return { badge: '🟡', calloutColor: 'yellow_bg' };
}

// Note: calculateDaysSince removed - days elapsed now comes from priceDeltas context

/**
 * Format a delta value with sign and 2 decimal places
 */
function formatDelta(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

/**
 * Format a percentage value
 */
function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}
