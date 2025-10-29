/**
 * FRED (Federal Reserve Economic Data) API Client
 *
 * Handles macroeconomic data fetching from FRED API.
 * Used for macro scoring component in stock analysis.
 *
 * Documentation: https://fred.stlouisfed.org/docs/api/
 */

import axios, { AxiosInstance } from 'axios';

interface FREDConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

interface FREDSeries {
  id: string;
  realtime_start: string;
  realtime_end: string;
  title: string;
  observation_start: string;
  observation_end: string;
  frequency: string;
  frequency_short: string;
  units: string;
  units_short: string;
  seasonal_adjustment: string;
  seasonal_adjustment_short: string;
  last_updated: string;
  popularity: number;
  notes: string;
}

interface FREDObservation {
  realtime_start: string;
  realtime_end: string;
  date: string;
  value: string;
}

interface FREDSeriesData {
  observations: FREDObservation[];
}

/**
 * FRED Series IDs for macro indicators
 */
export const FRED_SERIES = {
  FED_FUNDS_RATE: 'DFF', // Daily Federal Funds Rate
  UNEMPLOYMENT: 'UNRATE', // Unemployment Rate
  INFLATION_CPI: 'CPIAUCSL', // Consumer Price Index
  GDP: 'GDP', // Gross Domestic Product
  TREASURY_10Y: 'DGS10', // 10-Year Treasury Constant Maturity Rate
  TREASURY_2Y: 'DGS2', // 2-Year Treasury Constant Maturity Rate
  VIX: 'VIXCLS', // CBOE Volatility Index (VIX)
  CONSUMER_SENTIMENT: 'UMCSENT', // University of Michigan Consumer Sentiment
} as const;

export class FREDClient {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(config: FREDConfig) {
    this.apiKey = config.apiKey;

    this.client = axios.create({
      baseURL: config.baseUrl || 'https://api.stlouisfed.org/fred',
      timeout: config.timeout || 10000,
      params: {
        api_key: this.apiKey,
        file_type: 'json',
      },
    });
  }

  /**
   * Get series information
   */
  async getSeries(seriesId: string): Promise<FREDSeries> {
    const response = await this.client.get('/series', {
      params: {
        series_id: seriesId,
      },
    });

    return response.data.seriess[0];
  }

  /**
   * Get series observations (data points)
   * @param seriesId FRED series ID
   * @param limit Number of observations to retrieve (default: 1 - latest)
   */
  async getObservations(
    seriesId: string,
    limit: number = 1
  ): Promise<FREDObservation[]> {
    const response = await this.client.get<FREDSeriesData>(
      '/series/observations',
      {
        params: {
          series_id: seriesId,
          sort_order: 'desc', // Get latest first
          limit,
        },
      }
    );

    return response.data.observations || [];
  }

  /**
   * Get latest value for a series
   * Returns null if value is "." (missing data)
   */
  async getLatestValue(seriesId: string): Promise<number | null> {
    const observations = await this.getObservations(seriesId, 1);

    if (observations.length === 0) {
      return null;
    }

    const value = observations[0].value;

    // FRED uses "." to indicate missing data
    if (value === '.') {
      return null;
    }

    return parseFloat(value);
  }

  /**
   * Get Federal Funds Rate (overnight lending rate)
   */
  async getFedFundsRate(): Promise<number | null> {
    return this.getLatestValue(FRED_SERIES.FED_FUNDS_RATE);
  }

  /**
   * Get Unemployment Rate (%)
   */
  async getUnemploymentRate(): Promise<number | null> {
    return this.getLatestValue(FRED_SERIES.UNEMPLOYMENT);
  }

  /**
   * Get Consumer Price Index (inflation indicator)
   */
  async getInflationCPI(): Promise<number | null> {
    return this.getLatestValue(FRED_SERIES.INFLATION_CPI);
  }

  /**
   * Get GDP
   */
  async getGDP(): Promise<number | null> {
    return this.getLatestValue(FRED_SERIES.GDP);
  }

  /**
   * Get 10-Year Treasury Yield (%)
   */
  async getTreasury10Y(): Promise<number | null> {
    return this.getLatestValue(FRED_SERIES.TREASURY_10Y);
  }

  /**
   * Get 2-Year Treasury Yield (%)
   */
  async getTreasury2Y(): Promise<number | null> {
    return this.getLatestValue(FRED_SERIES.TREASURY_2Y);
  }

  /**
   * Get Yield Curve Spread (10Y - 2Y)
   * Negative spread often indicates recession risk
   */
  async getYieldCurveSpread(): Promise<number | null> {
    const [treasury10y, treasury2y] = await Promise.all([
      this.getTreasury10Y(),
      this.getTreasury2Y(),
    ]);

    if (treasury10y === null || treasury2y === null) {
      return null;
    }

    return treasury10y - treasury2y;
  }

  /**
   * Get VIX (market volatility index)
   */
  async getVIX(): Promise<number | null> {
    return this.getLatestValue(FRED_SERIES.VIX);
  }

  /**
   * Get Consumer Sentiment Index
   */
  async getConsumerSentiment(): Promise<number | null> {
    return this.getLatestValue(FRED_SERIES.CONSUMER_SENTIMENT);
  }

  /**
   * Helper: Get all macro data needed for stock analysis
   * Optimized to minimize API calls (6 calls total)
   */
  async getMacroData() {
    const [
      fedFundsRate,
      unemploymentRate,
      yieldCurveSpread,
      vix,
      consumerSentiment,
      gdp,
    ] = await Promise.all([
      this.getFedFundsRate(),
      this.getUnemploymentRate(),
      this.getYieldCurveSpread(),
      this.getVIX(),
      this.getConsumerSentiment(),
      this.getGDP(),
    ]);

    return {
      fedFundsRate,
      unemploymentRate,
      yieldCurveSpread,
      vix,
      consumerSentiment,
      gdp,
    };
  }

  /**
   * Get historical data for a series
   * Useful for trend analysis
   */
  async getHistoricalData(
    seriesId: string,
    limit: number = 30
  ): Promise<Array<{ date: string; value: number | null }>> {
    const observations = await this.getObservations(seriesId, limit);

    return observations.map((obs) => ({
      date: obs.date,
      value: obs.value === '.' ? null : parseFloat(obs.value),
    }));
  }
}

/**
 * Create FRED client instance
 */
export function createFREDClient(apiKey: string): FREDClient {
  return new FREDClient({ apiKey });
}
