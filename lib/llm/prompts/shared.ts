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
  const { ticker, currentMetrics, previousAnalysis, deltas } = context;

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

  // Current metrics context
  prompt += `## Analysis Context\n\n`;
  prompt += `**Current Metrics:**\n`;
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
