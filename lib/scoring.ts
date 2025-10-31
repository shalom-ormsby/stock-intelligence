/**
 * Stock Scoring Engine
 *
 * Multi-factor scoring system that evaluates stocks across 5 dimensions:
 * - Technical (30%): Price action, momentum, volume
 * - Fundamental (35%): Financials, valuation, profitability
 * - Macro (20%): Economic conditions, Fed policy
 * - Risk (15%): Volatility, beta, market cap
 * - Sentiment: Standalone score (not weighted in composite)
 *
 * Features:
 * - Graceful degradation when data is missing
 * - Validation to prevent NaN/invalid scores
 * - Logging for transparency
 * - Fallback to neutral (3.0) when insufficient data
 *
 * Ported from Python v0.3.0 StockScorer class
 */

import { ScoringConfig } from '../config/scoring-config';
import { isValidNumber, isValidScore } from './validators';
import { clamp } from './utils';
import { warn, info } from './logger';

export interface TechnicalData {
  current_price?: number;
  ma_50?: number;
  ma_200?: number;
  rsi?: number;
  macd?: number;
  macd_signal?: number;
  volume?: number;
  avg_volume_20d?: number;
  price_change_1m?: number;
  price_change_1d?: number;
  volatility_30d?: number;
}

export interface FundamentalData {
  market_cap?: number;
  pe_ratio?: number;
  debt_to_equity?: number;
  revenue_ttm?: number;
  eps?: number;
  beta?: number;
}

export interface MacroData {
  fed_funds_rate?: number;
  unemployment?: number;
  consumer_sentiment?: number;
  yield_curve_spread?: number;
  vix?: number;
}

export interface AnalysisData {
  technical: TechnicalData;
  fundamental: FundamentalData;
  macro: MacroData;
}

export interface ScoreResults {
  technical: number;
  fundamental: number;
  macro: number;
  risk: number;
  sentiment: number;
  composite: number;
  recommendation: string;
}

export class StockScorer {
  private weights = {
    technical: 0.3,
    fundamental: 0.35,
    macro: 0.2,
    risk: 0.15,
  };

  /**
   * Calculate all scores for a stock
   *
   * Returns validated scores with graceful degradation for missing data.
   * All scores are guaranteed to be in valid range (1.0-5.0).
   */
  calculateScores(data: AnalysisData): ScoreResults {
    // Calculate individual scores with validation
    const technical = this.validateScore(
      this.scoreTechnical(data.technical),
      'technical'
    );
    const fundamental = this.validateScore(
      this.scoreFundamental(data.fundamental),
      'fundamental'
    );
    const macro = this.validateScore(
      this.scoreMacro(data.macro),
      'macro'
    );
    const risk = this.validateScore(
      this.scoreRisk(data.technical, data.fundamental),
      'risk'
    );
    const sentiment = this.validateScore(
      this.scoreSentiment(data.technical),
      'sentiment'
    );

    const scores = {
      technical,
      fundamental,
      macro,
      risk,
      sentiment,
    };

    // Calculate composite score with validation
    let composite = 0.0;
    let totalWeight = 0.0;

    for (const [key, weight] of Object.entries(this.weights)) {
      const score = scores[key as keyof typeof this.weights];
      if (isValidScore(score)) {
        composite += score * weight;
        totalWeight += weight;
      } else {
        warn(`Invalid ${key} score, excluding from composite`, { score });
      }
    }

    // Normalize if some scores were excluded
    if (totalWeight < 1.0 && totalWeight > 0) {
      composite = composite / totalWeight;
      warn('Composite score normalized due to missing component scores', {
        totalWeight,
        normalizedComposite: composite,
      });
    }

    // Validate and clamp composite score
    if (!isValidScore(composite)) {
      warn('Invalid composite score calculated, using neutral fallback', {
        composite,
      });
      composite = 3.0;
    }

    composite = clamp(composite, 1.0, 5.0);
    composite = Math.round(composite * 100) / 100;

    const recommendation = this.getRecommendation(composite);

    info('Scores calculated successfully', {
      technical,
      fundamental,
      macro,
      risk,
      sentiment,
      composite,
      recommendation,
    });

    return {
      technical,
      fundamental,
      macro,
      risk,
      sentiment,
      composite,
      recommendation,
    };
  }

  /**
   * Validate and clamp score to valid range
   *
   * Ensures no NaN or invalid scores can propagate through the system
   */
  private validateScore(score: number, scoreName: string): number {
    if (!isValidNumber(score)) {
      warn(`Invalid ${scoreName} score, using neutral fallback`, { score });
      return 3.0;
    }

    if (!isValidScore(score)) {
      warn(`${scoreName} score out of range, clamping`, { score });
      return clamp(score, 1.0, 5.0);
    }

    return score;
  }

  /**
   * Technical Score (1.0-5.0)
   * Evaluates price action, momentum, and volume
   *
   * Uses graceful degradation - returns neutral score if insufficient data
   */
  scoreTechnical(tech: TechnicalData): number {
    let points = 0.0;
    let maxPoints = 0.0;
    const missingIndicators: string[] = [];

    // Moving averages: Price position relative to MA50 and MA200
    const { current_price, ma_50, ma_200 } = tech;
    if (isValidNumber(current_price) && isValidNumber(ma_50) && isValidNumber(ma_200)) {
      maxPoints += 3;
      if (current_price > ma_50 && ma_50 > ma_200) {
        points += 3; // Golden cross territory
      } else if (current_price > ma_50) {
        points += 2; // Above 50-day MA
      } else if (current_price > ma_200) {
        points += 1; // Above 200-day MA
      }
    } else {
      missingIndicators.push('moving averages');
    }

    // RSI: Momentum indicator
    const { rsi } = tech;
    if (isValidNumber(rsi)) {
      maxPoints += 2;
      if (
        rsi >= ScoringConfig.RSI_NEUTRAL_MIN &&
        rsi <= ScoringConfig.RSI_NEUTRAL_MAX
      ) {
        points += 2; // Healthy neutral momentum
      } else if (
        (rsi >= ScoringConfig.RSI_MODERATE_LOW_MIN &&
          rsi < ScoringConfig.RSI_MODERATE_LOW_MAX) ||
        (rsi > ScoringConfig.RSI_MODERATE_HIGH_MIN &&
          rsi <= ScoringConfig.RSI_MODERATE_HIGH_MAX)
      ) {
        points += 1; // Moderate oversold/overbought
      }
    } else {
      missingIndicators.push('RSI');
    }

    // MACD: Trend following indicator
    const { macd, macd_signal } = tech;
    if (isValidNumber(macd) && isValidNumber(macd_signal)) {
      maxPoints += 2;
      if (macd > macd_signal) {
        points += 2; // Bullish crossover
      } else if (macd > macd_signal * ScoringConfig.MACD_SIGNAL_CONVERGENCE) {
        points += 1; // Near crossover
      }
    } else {
      missingIndicators.push('MACD');
    }

    // Volume: Institutional interest
    const { volume, avg_volume_20d } = tech;
    if (isValidNumber(volume) && isValidNumber(avg_volume_20d) && avg_volume_20d > 0) {
      maxPoints += 1;
      if (volume > avg_volume_20d * ScoringConfig.VOLUME_SPIKE_RATIO) {
        points += 1; // Volume spike
      }
    } else {
      missingIndicators.push('volume');
    }

    // Price change: Momentum
    const { price_change_1m } = tech;
    if (isValidNumber(price_change_1m)) {
      maxPoints += 2;
      if (price_change_1m > ScoringConfig.PRICE_CHANGE_STRONG) {
        points += 2; // Strong momentum
      } else if (price_change_1m > ScoringConfig.PRICE_CHANGE_POSITIVE) {
        points += 1; // Positive momentum
      }
    } else {
      missingIndicators.push('price change');
    }

    // Log missing indicators
    if (missingIndicators.length > 0) {
      warn('Technical score using partial data', {
        missingIndicators,
        availablePoints: maxPoints,
        totalPossiblePoints: 10,
      });
    }

    // Default to neutral if no data
    if (maxPoints === 0) {
      warn('No technical data available, using neutral score');
      return 3.0;
    }

    // Scale to 1.0-5.0 range
    const score = 1.0 + (points / maxPoints) * 4.0;
    return Math.round(score * 100) / 100;
  }

  /**
   * Fundamental Score (1.0-5.0)
   * Evaluates financial health and valuation
   *
   * Uses graceful degradation - returns neutral score if insufficient data
   */
  scoreFundamental(fund: FundamentalData): number {
    let points = 0.0;
    let maxPoints = 0.0;
    const missingMetrics: string[] = [];

    // Market cap: Company size and stability
    const { market_cap } = fund;
    if (isValidNumber(market_cap)) {
      maxPoints += 3;
      if (market_cap > ScoringConfig.MARKET_CAP_MEGA) {
        points += 3; // Mega cap
      } else if (market_cap > ScoringConfig.MARKET_CAP_LARGE) {
        points += 2; // Large cap
      } else if (market_cap > ScoringConfig.MARKET_CAP_MID) {
        points += 1; // Mid cap
      }
    } else {
      missingMetrics.push('market cap');
    }

    // P/E ratio: Valuation
    const { pe_ratio } = fund;
    if (isValidNumber(pe_ratio) && pe_ratio > 0) {
      maxPoints += 2;
      if (
        pe_ratio >= ScoringConfig.PE_RATIO_OPTIMAL_MIN &&
        pe_ratio <= ScoringConfig.PE_RATIO_OPTIMAL_MAX
      ) {
        points += 2; // Optimal valuation
      } else if (
        (pe_ratio >= ScoringConfig.PE_RATIO_ACCEPTABLE_MIN &&
          pe_ratio < ScoringConfig.PE_RATIO_OPTIMAL_MIN) ||
        (pe_ratio > ScoringConfig.PE_RATIO_OPTIMAL_MAX &&
          pe_ratio <= ScoringConfig.PE_RATIO_ACCEPTABLE_MAX)
      ) {
        points += 1; // Acceptable valuation
      }
    } else {
      missingMetrics.push('P/E ratio');
    }

    // Debt-to-equity: Financial health
    const { debt_to_equity } = fund;
    if (isValidNumber(debt_to_equity) && debt_to_equity >= 0) {
      maxPoints += 2;
      if (debt_to_equity < ScoringConfig.DEBT_TO_EQUITY_IDEAL) {
        points += 2; // Excellent balance sheet
      } else if (debt_to_equity < ScoringConfig.DEBT_TO_EQUITY_ACCEPTABLE) {
        points += 1; // Acceptable leverage
      }
    } else {
      missingMetrics.push('debt to equity');
    }

    // Revenue: Scale and market presence
    const { revenue_ttm } = fund;
    if (isValidNumber(revenue_ttm) && revenue_ttm > 0) {
      maxPoints += 1;
      if (revenue_ttm > ScoringConfig.REVENUE_SIGNIFICANT) {
        points += 1; // Significant enterprise
      }
    } else {
      missingMetrics.push('revenue');
    }

    // EPS: Profitability
    const { eps } = fund;
    if (isValidNumber(eps)) {
      maxPoints += 2;
      if (eps > ScoringConfig.EPS_STRONG) {
        points += 2; // Strong profitability
      } else if (eps > ScoringConfig.EPS_POSITIVE) {
        points += 1; // Profitable
      }
    } else {
      missingMetrics.push('EPS');
    }

    // Log missing metrics
    if (missingMetrics.length > 0) {
      warn('Fundamental score using partial data', {
        missingMetrics,
        availablePoints: maxPoints,
        totalPossiblePoints: 10,
      });
    }

    if (maxPoints === 0) {
      warn('No fundamental data available, using neutral score');
      return 3.0;
    }

    const score = 1.0 + (points / maxPoints) * 4.0;
    return Math.round(score * 100) / 100;
  }

  /**
   * Macro Score (1.0-5.0)
   * Evaluates macroeconomic conditions
   *
   * Uses graceful degradation - macro data often unavailable
   */
  scoreMacro(macro: MacroData): number {
    let points = 0.0;
    let maxPoints = 0.0;
    const missingIndicators: string[] = [];

    // Fed funds rate: Monetary policy stance
    const { fed_funds_rate } = macro;
    if (isValidNumber(fed_funds_rate) && fed_funds_rate >= 0) {
      maxPoints += 3;
      if (fed_funds_rate < ScoringConfig.FED_FUNDS_LOW) {
        points += 3; // Accommodative policy
      } else if (fed_funds_rate < ScoringConfig.FED_FUNDS_MODERATE) {
        points += 2; // Neutral policy
      } else if (fed_funds_rate < ScoringConfig.FED_FUNDS_HIGH) {
        points += 1; // Restrictive but manageable
      }
    } else {
      missingIndicators.push('Fed funds rate');
    }

    // Unemployment: Labor market health
    const { unemployment } = macro;
    if (isValidNumber(unemployment) && unemployment >= 0) {
      maxPoints += 2;
      if (unemployment < ScoringConfig.UNEMPLOYMENT_HEALTHY) {
        points += 2; // Strong labor market
      } else if (unemployment < ScoringConfig.UNEMPLOYMENT_ACCEPTABLE) {
        points += 1; // Acceptable conditions
      }
    } else {
      missingIndicators.push('unemployment');
    }

    // Consumer sentiment: Economic confidence
    const { consumer_sentiment } = macro;
    if (isValidNumber(consumer_sentiment)) {
      maxPoints += 2;
      if (consumer_sentiment > ScoringConfig.CONSUMER_SENTIMENT_STRONG) {
        points += 2; // Strong confidence
      } else if (consumer_sentiment > ScoringConfig.CONSUMER_SENTIMENT_MODERATE) {
        points += 1; // Moderate confidence
      }
    } else {
      missingIndicators.push('consumer sentiment');
    }

    // Log missing indicators
    if (missingIndicators.length > 0) {
      warn('Macro score using partial data', {
        missingIndicators,
        availablePoints: maxPoints,
        totalPossiblePoints: 7,
      });
    }

    if (maxPoints === 0) {
      warn('No macro data available, using neutral score');
      return 3.0;
    }

    const score = 1.0 + (points / maxPoints) * 4.0;
    return Math.round(score * 100) / 100;
  }

  /**
   * Risk Score (1.0-5.0)
   * Evaluates volatility and stability
   *
   * Higher score = lower risk
   */
  scoreRisk(tech: TechnicalData, fund: FundamentalData): number {
    let points = 0.0;
    let maxPoints = 0.0;
    const missingMetrics: string[] = [];

    // Volatility: Price stability
    const { volatility_30d } = tech;
    if (isValidNumber(volatility_30d) && volatility_30d >= 0) {
      maxPoints += 3;
      if (volatility_30d < ScoringConfig.VOLATILITY_LOW) {
        points += 3; // Low volatility
      } else if (volatility_30d < ScoringConfig.VOLATILITY_MODERATE) {
        points += 2; // Moderate volatility
      } else if (volatility_30d < ScoringConfig.VOLATILITY_HIGH) {
        points += 1; // High but not extreme
      }
    } else {
      missingMetrics.push('volatility');
    }

    // Market cap: Size-based risk
    const { market_cap } = fund;
    if (isValidNumber(market_cap)) {
      maxPoints += 2;
      if (market_cap > ScoringConfig.MARKET_CAP_RISK_SAFE) {
        points += 2; // Too-big-to-fail
      } else if (market_cap > ScoringConfig.MARKET_CAP_LARGE) {
        points += 1; // Large cap stability
      }
    } else {
      missingMetrics.push('market cap');
    }

    // Beta: Market correlation
    const { beta } = fund;
    if (isValidNumber(beta)) {
      maxPoints += 2;
      if (beta < ScoringConfig.BETA_LOW) {
        points += 2; // Defensive
      } else if (beta < ScoringConfig.BETA_MODERATE) {
        points += 1; // Moderate correlation
      }
    } else {
      missingMetrics.push('beta');
    }

    // Log missing metrics
    if (missingMetrics.length > 0) {
      warn('Risk score using partial data', {
        missingMetrics,
        availablePoints: maxPoints,
        totalPossiblePoints: 7,
      });
    }

    if (maxPoints === 0) {
      warn('No risk data available, using neutral score');
      return 3.0;
    }

    const score = 1.0 + (points / maxPoints) * 4.0;
    return Math.round(score * 100) / 100;
  }

  /**
   * Sentiment Score (1.0-5.0)
   * Standalone score, not weighted in composite
   *
   * Uses graceful degradation - sentiment indicators often optional
   */
  scoreSentiment(tech: TechnicalData): number {
    let points = 0.0;
    let maxPoints = 0.0;
    const missingIndicators: string[] = [];

    // RSI: Market sentiment
    const { rsi } = tech;
    if (isValidNumber(rsi)) {
      maxPoints += 2;
      if (
        rsi >= ScoringConfig.RSI_SENTIMENT_NEUTRAL_MIN &&
        rsi <= ScoringConfig.RSI_SENTIMENT_NEUTRAL_MAX
      ) {
        points += 2; // Balanced sentiment
      } else if (
        (rsi >= ScoringConfig.RSI_SENTIMENT_MODERATE_LOW_MIN &&
          rsi < ScoringConfig.RSI_SENTIMENT_MODERATE_LOW_MAX) ||
        (rsi > ScoringConfig.RSI_SENTIMENT_MODERATE_HIGH_MIN &&
          rsi <= ScoringConfig.RSI_SENTIMENT_MODERATE_HIGH_MAX)
      ) {
        points += 1; // Moderate sentiment
      }
    } else {
      missingIndicators.push('RSI');
    }

    // Volume: Interest level
    const { volume, avg_volume_20d } = tech;
    if (isValidNumber(volume) && isValidNumber(avg_volume_20d) && avg_volume_20d > 0) {
      maxPoints += 1;
      if (volume > avg_volume_20d * ScoringConfig.VOLUME_POSITIVE_RATIO) {
        points += 1; // Increased interest
      }
    } else {
      missingIndicators.push('volume comparison');
    }

    // Price change: Momentum sentiment
    const { price_change_1m } = tech;
    if (isValidNumber(price_change_1m)) {
      maxPoints += 2;
      if (price_change_1m > ScoringConfig.PRICE_CHANGE_STRONG_1M_SENTIMENT) {
        points += 2; // Positive sentiment
      } else if (price_change_1m > ScoringConfig.PRICE_CHANGE_POSITIVE) {
        points += 1; // Mild positive sentiment
      }
    } else {
      missingIndicators.push('price change 1M');
    }

    // Log missing indicators
    if (missingIndicators.length > 0) {
      warn('Sentiment score using partial data', {
        missingIndicators,
        availablePoints: maxPoints,
        totalPossiblePoints: 5,
      });
    }

    if (maxPoints === 0) {
      warn('No sentiment data available, using neutral score');
      return 3.0;
    }

    const score = 1.0 + (points / maxPoints) * 4.0;
    return Math.round(score * 100) / 100;
  }

  /**
   * Get buy/sell recommendation based on composite score
   */
  getRecommendation(score: number): string {
    if (score >= 4.0) return 'Strong Buy';
    if (score >= 3.5) return 'Buy';
    if (score >= 3.0) return 'Moderate Buy';
    if (score >= 2.5) return 'Hold';
    if (score >= 2.0) return 'Moderate Sell';
    if (score >= 1.5) return 'Sell';
    return 'Strong Sell';
  }
}

/**
 * Create stock scorer instance
 */
export function createStockScorer(): StockScorer {
  return new StockScorer();
}
