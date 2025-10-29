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
 * Ported from Python v0.3.0 StockScorer class
 */

import { ScoringConfig } from '../config/scoring-config';

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
   */
  calculateScores(data: AnalysisData): ScoreResults {
    const scores: Partial<ScoreResults> = {
      technical: this.scoreTechnical(data.technical),
      fundamental: this.scoreFundamental(data.fundamental),
      macro: this.scoreMacro(data.macro),
      risk: this.scoreRisk(data.technical, data.fundamental),
      sentiment: this.scoreSentiment(data.technical),
    };

    // Calculate composite score
    let composite = 0.0;
    for (const [key, weight] of Object.entries(this.weights)) {
      const score = scores[key as keyof typeof this.weights];
      if (score !== undefined && score !== null) {
        composite += score * weight;
      }
    }

    scores.composite = Math.round(composite * 100) / 100;
    scores.recommendation = this.getRecommendation(scores.composite);

    return scores as ScoreResults;
  }

  /**
   * Technical Score (1.0-5.0)
   * Evaluates price action, momentum, and volume
   */
  scoreTechnical(tech: TechnicalData): number {
    let points = 0.0;
    let maxPoints = 0.0;

    // Moving averages: Price position relative to MA50 and MA200
    const { current_price, ma_50, ma_200 } = tech;
    if (current_price && ma_50 && ma_200) {
      maxPoints += 3;
      if (current_price > ma_50 && ma_50 > ma_200) {
        points += 3; // Golden cross territory
      } else if (current_price > ma_50) {
        points += 2; // Above 50-day MA
      } else if (current_price > ma_200) {
        points += 1; // Above 200-day MA
      }
    }

    // RSI: Momentum indicator
    const { rsi } = tech;
    if (rsi !== undefined && rsi !== null) {
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
    }

    // MACD: Trend following indicator
    const { macd, macd_signal } = tech;
    if (macd !== undefined && macd_signal !== undefined) {
      maxPoints += 2;
      if (macd > macd_signal) {
        points += 2; // Bullish crossover
      } else if (macd > macd_signal * ScoringConfig.MACD_SIGNAL_CONVERGENCE) {
        points += 1; // Near crossover
      }
    }

    // Volume: Institutional interest
    const { volume, avg_volume_20d } = tech;
    if (volume && avg_volume_20d) {
      maxPoints += 1;
      if (volume > avg_volume_20d * ScoringConfig.VOLUME_SPIKE_RATIO) {
        points += 1; // Volume spike
      }
    }

    // Price change: Momentum
    const { price_change_1m } = tech;
    if (price_change_1m !== undefined && price_change_1m !== null) {
      maxPoints += 2;
      if (price_change_1m > ScoringConfig.PRICE_CHANGE_STRONG) {
        points += 2; // Strong momentum
      } else if (price_change_1m > ScoringConfig.PRICE_CHANGE_POSITIVE) {
        points += 1; // Positive momentum
      }
    }

    // Default to neutral if no data
    if (maxPoints === 0) return 3.0;

    // Scale to 1.0-5.0 range
    return Math.round((1.0 + (points / maxPoints) * 4.0) * 100) / 100;
  }

  /**
   * Fundamental Score (1.0-5.0)
   * Evaluates financial health and valuation
   */
  scoreFundamental(fund: FundamentalData): number {
    let points = 0.0;
    let maxPoints = 0.0;

    // Market cap: Company size and stability
    const { market_cap } = fund;
    if (market_cap) {
      maxPoints += 3;
      if (market_cap > ScoringConfig.MARKET_CAP_MEGA) {
        points += 3; // Mega cap
      } else if (market_cap > ScoringConfig.MARKET_CAP_LARGE) {
        points += 2; // Large cap
      } else if (market_cap > ScoringConfig.MARKET_CAP_MID) {
        points += 1; // Mid cap
      }
    }

    // P/E ratio: Valuation
    const { pe_ratio } = fund;
    if (pe_ratio !== undefined && pe_ratio !== null) {
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
    }

    // Debt-to-equity: Financial health
    const { debt_to_equity } = fund;
    if (debt_to_equity !== undefined && debt_to_equity !== null) {
      maxPoints += 2;
      if (debt_to_equity < ScoringConfig.DEBT_TO_EQUITY_IDEAL) {
        points += 2; // Excellent balance sheet
      } else if (debt_to_equity < ScoringConfig.DEBT_TO_EQUITY_ACCEPTABLE) {
        points += 1; // Acceptable leverage
      }
    }

    // Revenue: Scale and market presence
    const { revenue_ttm } = fund;
    if (revenue_ttm) {
      maxPoints += 1;
      if (revenue_ttm > ScoringConfig.REVENUE_SIGNIFICANT) {
        points += 1; // Significant enterprise
      }
    }

    // EPS: Profitability
    const { eps } = fund;
    if (eps !== undefined && eps !== null) {
      maxPoints += 2;
      if (eps > ScoringConfig.EPS_STRONG) {
        points += 2; // Strong profitability
      } else if (eps > ScoringConfig.EPS_POSITIVE) {
        points += 1; // Profitable
      }
    }

    if (maxPoints === 0) return 3.0;
    return Math.round((1.0 + (points / maxPoints) * 4.0) * 100) / 100;
  }

  /**
   * Macro Score (1.0-5.0)
   * Evaluates macroeconomic conditions
   */
  scoreMacro(macro: MacroData): number {
    let points = 0.0;
    let maxPoints = 0.0;

    // Fed funds rate: Monetary policy stance
    const { fed_funds_rate } = macro;
    if (fed_funds_rate !== undefined && fed_funds_rate !== null) {
      maxPoints += 3;
      if (fed_funds_rate < ScoringConfig.FED_FUNDS_LOW) {
        points += 3; // Accommodative policy
      } else if (fed_funds_rate < ScoringConfig.FED_FUNDS_MODERATE) {
        points += 2; // Neutral policy
      } else if (fed_funds_rate < ScoringConfig.FED_FUNDS_HIGH) {
        points += 1; // Restrictive but manageable
      }
    }

    // Unemployment: Labor market health
    const { unemployment } = macro;
    if (unemployment !== undefined && unemployment !== null) {
      maxPoints += 2;
      if (unemployment < ScoringConfig.UNEMPLOYMENT_HEALTHY) {
        points += 2; // Strong labor market
      } else if (unemployment < ScoringConfig.UNEMPLOYMENT_ACCEPTABLE) {
        points += 1; // Acceptable conditions
      }
    }

    // Consumer sentiment: Economic confidence
    const { consumer_sentiment } = macro;
    if (consumer_sentiment !== undefined && consumer_sentiment !== null) {
      maxPoints += 2;
      if (consumer_sentiment > ScoringConfig.CONSUMER_SENTIMENT_STRONG) {
        points += 2; // Strong confidence
      } else if (consumer_sentiment > ScoringConfig.CONSUMER_SENTIMENT_MODERATE) {
        points += 1; // Moderate confidence
      }
    }

    if (maxPoints === 0) return 3.0;
    return Math.round((1.0 + (points / maxPoints) * 4.0) * 100) / 100;
  }

  /**
   * Risk Score (1.0-5.0)
   * Evaluates volatility and stability
   */
  scoreRisk(tech: TechnicalData, fund: FundamentalData): number {
    let points = 0.0;
    let maxPoints = 0.0;

    // Volatility: Price stability
    const { volatility_30d } = tech;
    if (volatility_30d !== undefined && volatility_30d !== null) {
      maxPoints += 3;
      if (volatility_30d < ScoringConfig.VOLATILITY_LOW) {
        points += 3; // Low volatility
      } else if (volatility_30d < ScoringConfig.VOLATILITY_MODERATE) {
        points += 2; // Moderate volatility
      } else if (volatility_30d < ScoringConfig.VOLATILITY_HIGH) {
        points += 1; // High but not extreme
      }
    }

    // Market cap: Size-based risk
    const { market_cap } = fund;
    if (market_cap) {
      maxPoints += 2;
      if (market_cap > ScoringConfig.MARKET_CAP_RISK_SAFE) {
        points += 2; // Too-big-to-fail
      } else if (market_cap > ScoringConfig.MARKET_CAP_LARGE) {
        points += 1; // Large cap stability
      }
    }

    // Beta: Market correlation
    const { beta } = fund;
    if (beta !== undefined && beta !== null) {
      maxPoints += 2;
      if (beta < ScoringConfig.BETA_LOW) {
        points += 2; // Defensive
      } else if (beta < ScoringConfig.BETA_MODERATE) {
        points += 1; // Moderate correlation
      }
    }

    if (maxPoints === 0) return 3.0;
    return Math.round((1.0 + (points / maxPoints) * 4.0) * 100) / 100;
  }

  /**
   * Sentiment Score (1.0-5.0)
   * Standalone score, not weighted in composite
   */
  scoreSentiment(tech: TechnicalData): number {
    let points = 0.0;
    let maxPoints = 0.0;

    // RSI: Market sentiment
    const { rsi } = tech;
    if (rsi !== undefined && rsi !== null) {
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
    }

    // Volume: Interest level
    const { volume, avg_volume_20d } = tech;
    if (volume && avg_volume_20d) {
      maxPoints += 1;
      if (volume > avg_volume_20d * ScoringConfig.VOLUME_POSITIVE_RATIO) {
        points += 1; // Increased interest
      }
    }

    // Price change: Momentum sentiment
    const { price_change_1m } = tech;
    if (price_change_1m !== undefined && price_change_1m !== null) {
      maxPoints += 2;
      if (price_change_1m > ScoringConfig.PRICE_CHANGE_STRONG_1M_SENTIMENT) {
        points += 2; // Positive sentiment
      } else if (price_change_1m > ScoringConfig.PRICE_CHANGE_POSITIVE) {
        points += 1; // Mild positive sentiment
      }
    }

    if (maxPoints === 0) return 3.0;
    return Math.round((1.0 + (points / maxPoints) * 4.0) * 100) / 100;
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
