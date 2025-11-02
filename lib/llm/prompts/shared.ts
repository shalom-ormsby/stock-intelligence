/**
 * Unified Prompt Builder (Single Source of Truth)
 *
 * All LLM providers use this shared prompt template.
 * This ensures consistency and eliminates 3x maintenance burden.
 *
 * v1.0.3 - Refactored from separate provider-specific prompts
 */

import { AnalysisContext } from '../types';

/**
 * Build analysis prompt for any LLM provider
 *
 * Uses markdown formatting which all modern LLMs understand.
 * Eliminates need for separate Gemini/Claude/OpenAI prompt files.
 */
export function buildAnalysisPrompt(context: AnalysisContext): string {
  const { ticker, currentMetrics, previousAnalysis, historicalAnalyses, deltas } = context;

  let prompt = '';

  // Role and task
  prompt += `You are a financial analysis expert. Analyze ${ticker} stock and generate a comprehensive 7-section investment analysis in Notion-flavored markdown.\n\n`;

  // Current metrics
  prompt += `## Current Metrics\n\n`;
  prompt += `**Composite Score:** ${currentMetrics.compositeScore}/5.0 (${currentMetrics.recommendation})\n`;
  prompt += `**Confidence:** ${currentMetrics.confidence}/5.0\n`;
  prompt += `**Pattern:** ${currentMetrics.pattern}\n`;
  prompt += `**Data Quality:** ${currentMetrics.dataQualityGrade}\n\n`;

  prompt += `**Category Breakdown:**\n`;
  prompt += `- Technical: ${currentMetrics.technicalScore}/5.0\n`;
  prompt += `- Fundamental: ${currentMetrics.fundamentalScore}/5.0\n`;
  prompt += `- Macro: ${currentMetrics.macroScore}/5.0\n`;
  prompt += `- Risk: ${currentMetrics.riskScore}/5.0\n`;
  prompt += `- Sentiment: ${currentMetrics.sentimentScore}/5.0\n`;
  prompt += `- Sector: ${currentMetrics.sectorScore}/5.0\n\n`;

  // Historical context and deltas
  if (previousAnalysis && deltas) {
    prompt += `## Changes Since Last Analysis\n\n`;
    prompt += `**Previous Analysis:** ${previousAnalysis.date}\n`;
    prompt += `**Composite Score:** ${previousAnalysis.compositeScore}/5.0 → ${currentMetrics.compositeScore}/5.0 (${deltas.scoreChange > 0 ? '+' : ''}${deltas.scoreChange.toFixed(2)})\n`;
    prompt += `**Recommendation:** ${previousAnalysis.recommendation} → ${currentMetrics.recommendation}\n`;
    prompt += `**Trend Direction:** ${deltas.trendDirection}\n`;
    prompt += `**Days Since Last:** ${calculateDaysSince(previousAnalysis.date)}\n\n`;

    // Category score deltas (if available)
    if (deltas.categoryDeltas) {
      prompt += `**Category Score Changes:**\n`;
      prompt += `- Technical: ${formatDelta(deltas.categoryDeltas.technical)}\n`;
      prompt += `- Fundamental: ${formatDelta(deltas.categoryDeltas.fundamental)}\n`;
      prompt += `- Macro: ${formatDelta(deltas.categoryDeltas.macro)}\n`;
      prompt += `- Risk: ${formatDelta(deltas.categoryDeltas.risk)}\n`;
      prompt += `- Sentiment: ${formatDelta(deltas.categoryDeltas.sentiment)}\n\n`;
    }

    // Price & volume deltas (if available)
    if (deltas.priceDeltas) {
      prompt += `**Price & Volume Movement:**\n`;
      prompt += `- Price Change: ${formatPercent(deltas.priceDeltas.priceChangePercent)}\n`;
      prompt += `- Volume Change: ${formatPercent(deltas.priceDeltas.volumeChangePercent)}\n`;
      prompt += `- Days Elapsed: ${deltas.priceDeltas.daysElapsed}\n`;
      if (deltas.priceDeltas.annualizedReturn) {
        prompt += `- Annualized Return: ${formatPercent(deltas.priceDeltas.annualizedReturn)}\n`;
      }
      prompt += '\n';
    }
  }

  // Historical trend
  if (historicalAnalyses && historicalAnalyses.length > 0) {
    prompt += `## Historical Trend (Last ${historicalAnalyses.length} Analyses)\n\n`;
    historicalAnalyses.forEach((h) => {
      prompt += `- ${h.date}: ${h.compositeScore}/5.0 (${h.recommendation})\n`;
    });
    prompt += '\n';
  }

  // Required output structure
  prompt += `## Required Output Format\n\n`;
  prompt += `Generate a 7-section analysis with these exact headings:\n\n`;
  prompt += `### 1. Data Foundation & Quality\n`;
  prompt += `### 2. Dual-Lens Analysis (Value × Momentum)\n`;
  prompt += `### 3. Market Intelligence & Catalysts\n`;
  prompt += `### 4. Strategic Trade Plan\n`;
  prompt += `### 5. Directional Outlook\n`;
  prompt += `### 6. Portfolio Integration\n`;
  prompt += `### 7. Investment Recommendation\n\n`;

  // Instructions
  prompt += `## Formatting & Content Guidelines\n\n`;
  prompt += `- Use H3 (###) for section headings\n`;
  prompt += `- Use **bold** for key points and emphasis\n`;
  prompt += `- Use bullet points for lists\n`;
  prompt += `- **IMPORTANT:** If historical data exists, explicitly highlight what changed and why (e.g., "Technical score improved +1.2 due to RSI recovery from oversold territory")\n`;
  prompt += `- Explain the significance of changes (e.g., "Price rallied +12% but fundamental score declined, suggesting momentum not backed by fundamentals")\n`;
  prompt += `- Keep analysis concise but comprehensive (information-dense)\n`;
  prompt += `- Focus on actionable insights with specific data points\n`;
  prompt += `- Connect score changes to real metrics (price, volume, indicators)\n`;

  return prompt;
}

/**
 * Calculate days since a given date
 */
function calculateDaysSince(dateString: string): number {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch {
    return 0;
  }
}

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
