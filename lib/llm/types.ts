/**
 * LLM Abstraction Layer - Core Types
 *
 * Shared types and interfaces for all LLM providers
 */

import { MarketContext } from '../market';

export interface AnalysisContext {
  ticker: string;
  currentDate: string; // ISO date string (e.g., "2025-11-16")
  currentMetrics: Record<string, any>; // Expanded to include all technical, fundamental, and macro data
  marketContext?: MarketContext | null; // NEW: Market regime and sector rotation context
  previousAnalysis?: {
    date: string;
    compositeScore: number;
    recommendation: string;
    metrics: Record<string, any>;
  };
  historicalAnalyses?: Array<{
    date: string;
    compositeScore: number;
    recommendation: string;
  }>;
  deltas?: {
    scoreChange: number;
    recommendationChange: string;
    trendDirection: 'improving' | 'declining' | 'stable';
    categoryDeltas?: {
      technical: number;
      fundamental: number;
      macro: number;
      risk: number;
      sentiment: number;
      marketAlignment?: number; // NEW: Market alignment score delta
    };
    priceDeltas?: {
      priceChangePercent: number;
      volumeChangePercent: number;
      daysElapsed: number;
      annualizedReturn?: number;
    };
  };
}

export interface AnalysisResult {
  content: string;          // Full 7-section analysis
  modelUsed: string;        // e.g., "gemini-2.5-flash"
  tokensUsed: {
    input: number;
    output: number;
  };
  latencyMs: number;
  cost: number;
}

export interface LLMConfig {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  // Provider-specific options
  [key: string]: any;
}
