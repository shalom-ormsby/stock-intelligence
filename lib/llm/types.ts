/**
 * LLM Abstraction Layer - Core Types
 *
 * Shared types and interfaces for all LLM providers
 */

export interface AnalysisContext {
  ticker: string;
  currentMetrics: Record<string, any>;
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
