# ==================================================================================================
# Stock Analyzer — v2.5.2 (Single Cell, Hybrid Dual‑API, Copy‑Paste Ready)
# - Technical: Polygon
# - Fundamental: Alpha Vantage
# - Macro: FRED
# - Scores: Technical, Fundamental, Macro, Risk, Sentiment (unweighted), Composite
# - NEW: Pattern Score, Pattern Signal, Detected Patterns (1.0–5.0, NOT included in Composite)
# - Syncs to Notion: Stock Analyses (upsert) + Stock History (append)
# ==================================================================================================

import os
import json
import requests
import statistics
from datetime import datetime, timedelta, timezone
import pytz
from typing import Dict, List, Tuple, Optional, Any
from dotenv import load_dotenv

load_dotenv()  # Load environment variables from .env file

PACIFIC_TZ = pytz.timezone("America/Los_Angeles")
VERSION = "v2.5.2"

# =============================================================================
# CONFIGURATION — REQUIRED: Set via environment variables
# =============================================================================
# SECURITY: API keys must be set as environment variables before running.
# See README.md or .env.example for setup instructions.
POLYGON_API_KEY        = os.environ.get("POLYGON_API_KEY")
ALPHA_VANTAGE_API_KEY  = os.environ.get("ALPHA_VANTAGE_API_KEY")
FRED_API_KEY           = os.environ.get("FRED_API_KEY")
NOTION_API_KEY         = os.environ.get("NOTION_API_KEY")
STOCK_ANALYSES_DB_ID   = os.environ.get("STOCK_ANALYSES_DB_ID")
STOCK_HISTORY_DB_ID    = os.environ.get("STOCK_HISTORY_DB_ID")

def _require(val: str, label: str):
    if not val:
        raise ValueError(
            f"Missing required environment variable: {label}\n"
            f"Please set it in your .env file or environment.\n"
            f"See .env.example for template."
        )
for _v, _l in [
    (POLYGON_API_KEY, "POLYGON_API_KEY"),
    (ALPHA_VANTAGE_API_KEY, "ALPHA_VANTAGE_API_KEY"),
    (FRED_API_KEY, "FRED_API_KEY"),
    (NOTION_API_KEY, "NOTION_API_KEY"),
    (STOCK_ANALYSES_DB_ID, "STOCK_ANALYSES_DB_ID"),
    (STOCK_HISTORY_DB_ID, "STOCK_HISTORY_DB_ID"),
]:
    _require(_v, _l)

# =============================================================================
# Helpers
# =============================================================================
def safe_float(x: Any, default: Optional[float] = None) -> Optional[float]:
    try:
        if x in (None, "", "None"):
            return default
        return float(x)
    except Exception:
        return default

# =============================================================================
# POLYGON CLIENT — Technical
# =============================================================================
class PolygonClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.polygon.io"
        self.call_count = 0

    def _make_request(self, endpoint: str, params: Optional[dict] = None) -> Optional[dict]:
        params = params or {}
        params["apiKey"] = self.api_key
        url = f"{self.base_url}{endpoint}"
        try:
            r = requests.get(url, params=params, timeout=30)
            self.call_count += 1
            if r.status_code == 200:
                return r.json()
            print(f"[Polygon] {r.status_code}: {r.text[:300]}")
        except Exception as e:
            print(f"[Polygon] Exception: {e}")
        return None

    def get_snapshot(self, ticker: str) -> Optional[dict]:
        return self._make_request(f"/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}")

    def get_aggregates(self, ticker: str, from_date: str, to_date: str, timespan: str = "day") -> Optional[dict]:
        return self._make_request(
            f"/v2/aggs/ticker/{ticker}/range/1/{timespan}/{from_date}/{to_date}",
            {"adjusted": "true", "sort": "asc", "limit": 5000},
        )

    def get_sma(self, ticker: str, window: int = 50, timespan: str = "day", limit: int = 120) -> Optional[dict]:
        return self._make_request(
            f"/v1/indicators/sma/{ticker}",
            {"timespan": timespan, "adjusted": "true", "window": window, "series_type": "close", "order": "desc", "limit": limit},
        )

    def get_rsi(self, ticker: str, window: int = 14, timespan: str = "day", limit: int = 120) -> Optional[dict]:
        return self._make_request(
            f"/v1/indicators/rsi/{ticker}",
            {"timespan": timespan, "adjusted": "true", "window": window, "series_type": "close", "order": "desc", "limit": limit},
        )

    def get_macd(self, ticker: str, timespan: str = "day", limit: int = 120) -> Optional[dict]:
        return self._make_request(
            f"/v1/indicators/macd/{ticker}",
            {
                "timespan": timespan, "adjusted": "true",
                "short_window": 12, "long_window": 26, "signal_window": 9,
                "series_type": "close", "order": "desc", "limit": limit
            },
        )

# =============================================================================
# ALPHA VANTAGE — Fundamental
# =============================================================================
class AlphaVantageClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://www.alphavantage.co/query"
        self.call_count = 0

    def _call(self, params: dict) -> Optional[dict]:
        params["apikey"] = self.api_key
        try:
            r = requests.get(self.base_url, params=params, timeout=40)
            self.call_count += 1
            if r.status_code != 200:
                print(f"[Alpha Vantage] {r.status_code} {r.text[:300]}")
                return None
            data = r.json()
            if "Error Message" in data or "Note" in data:
                print(f"[Alpha Vantage] {data.get('Error Message') or data.get('Note')}")
                return None
            return data
        except Exception as e:
            print(f"[Alpha Vantage] Exception: {e}")
            return None

    def get_overview(self, ticker: str) -> Optional[dict]:
        return self._call({"function": "OVERVIEW", "symbol": ticker})

    def get_income_statement(self, ticker: str) -> Optional[dict]:
        return self._call({"function": "INCOME_STATEMENT", "symbol": ticker})

    def get_balance_sheet(self, ticker: str) -> Optional[dict]:
        return self._call({"function": "BALANCE_SHEET", "symbol": ticker})

# =============================================================================
# FRED — Macro
# =============================================================================
class FREDClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.stlouisfed.org/fred/series/observations"
        self.call_count = 0

    def _latest(self, series_id: str) -> Optional[float]:
        params = {"series_id": series_id, "api_key": self.api_key, "file_type": "json", "sort_order": "desc", "limit": 1}
        try:
            r = requests.get(self.base_url, params=params, timeout=30)
            self.call_count += 1
            if r.status_code == 200:
                data = r.json()
                obs = data.get("observations") or []
                if obs:
                    return safe_float(obs[0].get("value"))
        except Exception as e:
            print(f"[FRED] {series_id} exception: {e}")
        return None

    def get_macro_data(self) -> dict:
        return {
            "fed_funds_rate":     self._latest("DFF"),
            "unemployment":       self._latest("UNRATE"),
            "consumer_sentiment": self._latest("UMCSENT"),
            "gdp_growth":         self._latest("A191RL1Q225SBEA"),
            "inflation":          self._latest("CPIAUCSL"),
        }

# =============================================================================
# Collector — Hybrid Dual‑API
# =============================================================================
class DataCollector:
    def __init__(self, polygon: PolygonClient, alpha_vantage: AlphaVantageClient, fred: FREDClient):
        self.polygon = polygon
        self.alpha_vantage = alpha_vantage
        self.fred = fred

    def collect_all_data(self, ticker: str) -> dict:
        print("\n" + "="*60)
        print(f"Collecting data for {ticker}")
        print("="*60)

        technical = self._collect_technical_data(ticker)
        fundamental = self._collect_fundamental_data(ticker)
        macro = self.fred.get_macro_data()

        combined = {
            "ticker": ticker,
            "timestamp": datetime.now(PACIFIC_TZ),
            "technical": technical,
            "fundamental": fundamental,
            "macro": macro,
            "api_calls": {
                "polygon": self.polygon.call_count,
                "alpha_vantage": self.alpha_vantage.call_count,
                "fred": self.fred.call_count,
            },
        }
        print("\n" + "="*60)
        print("Data collection complete!")
        print(f"API Calls — Polygon: {self.polygon.call_count}, Alpha Vantage: {self.alpha_vantage.call_count}, FRED: {self.fred.call_count}")
        print("="*60)
        return combined

    def _collect_technical_data(self, ticker: str) -> dict:
        tech: Dict[str, Any] = {}

        snap = self.polygon.get_snapshot(ticker)
        if snap and "ticker" in snap:
            t = snap["ticker"]
            day  = t.get("day") or {}
            prev = t.get("prevDay") or {}
            tech["current_price"]   = safe_float(day.get("c"))
            tech["volume"]          = safe_float(day.get("v"))
            tech["price_change_1d"] = safe_float(t.get("todaysChangePerc"), 0.0) / 100.0
            tech["prev_close"]      = safe_float(prev.get("c"))

        to_date   = datetime.now().strftime("%Y-%m-%d")
        from_date = (datetime.now() - timedelta(days=220)).strftime("%Y-%m-%d")
        aggs = self.polygon.get_aggregates(ticker, from_date, to_date, timespan="day")
        closes: List[float] = []
        volumes: List[float] = []
        if aggs and "results" in aggs:
            for bar in aggs["results"]:
                c = safe_float(bar.get("c"))
                v = safe_float(bar.get("v"))
                if c is not None:
                    closes.append(c)
                if v is not None:
                    volumes.append(v)
            if closes:
                tech["daily_closes_full"] = closes[:]
            if len(volumes) >= 20:
                tech["avg_volume_20d"] = sum(volumes[-20:]) / 20.0
            if len(closes) >= 30:
                rets = []
                for i in range(1, 30):
                    p0, p1 = closes[-i-1], closes[-i]
                    if p0 and p1:
                        rets.append((p1 - p0) / p0)
                tech["volatility_30d"] = statistics.pstdev(rets) if rets else None
            if len(closes) >= 6:
                tech["price_change_5d"] = (closes[-1] - closes[-6]) / closes[-6]
            if len(closes) >= 21:
                tech["price_change_1m"] = (closes[-1] - closes[-21]) / closes[-21]

        sma50 = self.polygon.get_sma(ticker, window=50)
        if sma50 and sma50.get("results", {}).get("values"):
            tech["ma_50"] = safe_float(sma50["results"]["values"][0].get("value"))

        sma200 = self.polygon.get_sma(ticker, window=200)
        if sma200 and sma200.get("results", {}).get("values"):
            tech["ma_200"] = safe_float(sma200["results"]["values"][0].get("value"))

        rsi = self.polygon.get_rsi(ticker, window=14)
        if rsi and rsi.get("results", {}).get("values"):
            tech["rsi"] = safe_float(rsi["results"]["values"][0].get("value"))

        macd = self.polygon.get_macd(ticker)
        if macd and macd.get("results", {}).get("values"):
            vals = macd["results"]["values"]
            tech["macd"]        = safe_float(vals[0].get("value"))
            tech["macd_signal"] = safe_float(vals[0].get("signal"))
            if len(vals) >= 2:
                tech["macd_previous"] = safe_float(vals[1].get("value"))

        return tech

    def _collect_fundamental_data(self, ticker: str) -> dict:
        fund: Dict[str, Any] = {}
        ov = self.alpha_vantage.get_overview(ticker)
        shares_out = None
        if ov:
            fund["company_name"]  = ov.get("Name")
            fund["market_cap"]    = safe_float(ov.get("MarketCapitalization"))
            fund["pe_ratio"]      = safe_float(ov.get("PERatio"))
            fund["beta"]          = safe_float(ov.get("Beta"))
            fund["52_week_high"]  = safe_float(ov.get("52WeekHigh"))
            fund["52_week_low"]   = safe_float(ov.get("52WeekLow"))
            shares_out            = safe_float(ov.get("SharesOutstanding"))

        inc = self.alpha_vantage.get_income_statement(ticker)
        if inc and inc.get("annualReports"):
            latest = inc["annualReports"][0]
            fund["revenue_ttm"] = safe_float(latest.get("totalRevenue"))
            net_income = safe_float(latest.get("netIncome"))
            if net_income is not None and shares_out and shares_out > 0:
                fund["eps"] = net_income / shares_out

        bs = self.alpha_vantage.get_balance_sheet(ticker)
        if bs and bs.get("annualReports"):
            latest = bs["annualReports"][0]
            total_debt   = safe_float(latest.get("shortLongTermDebtTotal"), 0.0) or 0.0
            total_equity = safe_float(latest.get("totalShareholderEquity"), 1.0)
            if total_equity and total_equity > 0:
                fund["debt_to_equity"] = total_debt / total_equity

        return fund

# =============================================================================
# Pattern Detection — v2.5.2
# =============================================================================
def _detect_cross(prev_a: Optional[float], prev_b: Optional[float], cur_a: Optional[float], cur_b: Optional[float]) -> Tuple[bool, bool]:
    if None in (prev_a, prev_b, cur_a, cur_b):
        return False, False
    was_above = prev_a > prev_b
    is_above  = cur_a > cur_b
    if not was_above and is_above:
        return True, False
    if was_above and not is_above:
        return False, True
    return False, False

def _map_signal(score: float) -> str:
    if score <= 2.0: return "🚨 Extremely Bearish"
    if score <= 2.5: return "📉 Bearish"
    if score <= 3.5: return "✋ Neutral"
    if score <= 4.0: return "📈 Bullish"
    return "🚀 Extremely Bullish"

def _derive_prev_mas(tech: dict) -> None:
    closes = tech.get("daily_closes_full")
    if not isinstance(closes, list) or len(closes) < 201:
        return
    try:
        tech.setdefault("prev_ma_50",  sum(closes[-51:-1])  / 50.0)
        tech.setdefault("prev_ma_200", sum(closes[-201:-1]) / 200.0)
    except Exception:
        pass

def compute_pattern_score(tech: dict) -> Tuple[float, str, List[str]]:
    if not isinstance(tech, dict):
        return 3.0, "✋ Neutral", ["Mixed/Range"]

    _derive_prev_mas(tech)

    price      = safe_float(tech.get("current_price"))
    ma50       = safe_float(tech.get("ma_50"))
    ma200      = safe_float(tech.get("ma_200"))
    prev_ma50  = safe_float(tech.get("prev_ma_50"))
    prev_ma200 = safe_float(tech.get("prev_ma_200"))
    rsi        = safe_float(tech.get("rsi"))
    macd       = safe_float(tech.get("macd"))
    macd_sig   = safe_float(tech.get("macd_signal"))
    macd_prev  = safe_float(tech.get("macd_previous"))
    vol        = safe_float(tech.get("volume"))
    avg_vol    = safe_float(tech.get("avg_volume_20d"))

    score = 3.0
    detected: List[str] = []

    bull, bear = _detect_cross(prev_ma50, prev_ma200, ma50, ma200)
    if bull:
        score += 1.5; detected.append("Golden Cross")
    if bear:
        score -= 1.5; detected.append("Death Cross")

    if None not in (price, ma50, ma200):
        if price > ma50 > ma200:
            score += 0.5; detected.append("Strong Uptrend")
        elif price < ma50 < ma200:
            score -= 0.5; detected.append("Strong Downtrend")

    if rsi is not None:
        if rsi < 30:
            score += 0.5; detected.append("RSI Oversold")
        elif rsi > 70:
            score -= 0.5; detected.append("RSI Overbought")

    macd_bull = macd is not None and macd_sig is not None and macd > macd_sig
    macd_bear = macd is not None and macd_sig is not None and macd < macd_sig
    if None not in (macd, macd_sig, macd_prev):
        prev_above = macd_prev > macd_sig
        curr_above = macd > macd_sig
        if not prev_above and curr_above:
            macd_bull, macd_bear = True, False
        elif prev_above and not curr_above:
            macd_bull, macd_bear = False, True
    if macd_bull:
        score += 0.3; detected.append("MACD Bullish Crossover")
    elif macd_bear:
        score -= 0.3; detected.append("MACD Bearish Crossover")

    if None not in (vol, avg_vol) and avg_vol and avg_vol > 0:
        ratio = vol / avg_vol
        if ratio >= 1.8:
            score += 0.4; detected.append("Bullish Volume Surge")
        elif ratio <= 0.6:
            score -= 0.4; detected.append("Bearish Volume Dump")

    score = max(1.0, min(5.0, round(score, 2)))
    signal = _map_signal(score)
    if not detected:
        detected = ["Mixed/Range"]
    return score, signal, detected

# =============================================================================
# Scoring
# =============================================================================
class StockScorer:
    def __init__(self):
        self.weights = {"technical": 0.30, "fundamental": 0.35, "macro": 0.20, "risk": 0.15}

    def calculate_scores(self, data: dict) -> dict:
        tech  = data["technical"]
        fund  = data["fundamental"]
        macro = data["macro"]
        scores = {
            "technical":   self._score_technical(tech),
            "fundamental": self._score_fundamental(fund),
            "macro":       self._score_macro(macro),
            "risk":        self._score_risk(tech, fund),
            "sentiment":   self._score_sentiment(tech),
        }
        comp = 0.0
        for k, w in self.weights.items():
            v = scores.get(k)
            if v is not None:
                comp += v * w
        scores["composite"] = round(comp, 2)
        scores["recommendation"] = self._recommend(scores["composite"])
        return scores

    def _score_technical(self, tech: dict) -> float:
        points, maxp = 0.0, 0.0
        price, ma50, ma200 = tech.get("current_price"), tech.get("ma_50"), tech.get("ma_200")
        if None not in (price, ma50, ma200):
            maxp += 3
            if price > ma50 > ma200: points += 3
            elif price > ma50:       points += 2
            elif price > ma200:      points += 1
        rsi = tech.get("rsi")
        if rsi is not None:
            maxp += 2
            if 40 <= rsi <= 60:                      points += 2
            elif 30 <= rsi < 40 or 60 < rsi <= 70:   points += 1
        macd, sig = tech.get("macd"), tech.get("macd_signal")
        if macd is not None and sig is not None:
            maxp += 2
            if macd > sig:              points += 2
            elif macd > sig * 0.9:      points += 1
        vol, avg = tech.get("volume"), tech.get("avg_volume_20d")
        if vol is not None and avg is not None:
            maxp += 1
            if vol > avg * 1.2:         points += 1
        ch1m = tech.get("price_change_1m")
        if ch1m is not None:
            maxp += 2
            if ch1m > 0.10:             points += 2
            elif ch1m > 0:              points += 1
        if maxp == 0: return 3.0
        return round(1.0 + (points / maxp) * 4.0, 2)

    def _score_fundamental(self, fund: dict) -> float:
        points, maxp = 0.0, 0.0
        mcap = fund.get("market_cap")
        if mcap is not None:
            maxp += 3
            if mcap > 200e9:   points += 3
            elif mcap > 10e9:  points += 2
            elif mcap > 2e9:   points += 1
        pe = fund.get("pe_ratio")
        if pe is not None:
            maxp += 2
            if 10 <= pe <= 25:      points += 2
            elif 5 <= pe < 10 or 25 < pe <= 35: points += 1
        de = fund.get("debt_to_equity")
        if de is not None:
            maxp += 2
            if de < 0.5:      points += 2
            elif de < 1.0:    points += 1
        rev = fund.get("revenue_ttm")
        if rev is not None:
            maxp += 1
            if rev > 10e9:    points += 1
        eps = fund.get("eps")
        if eps is not None:
            maxp += 2
            if eps > 5:       points += 2
            elif eps > 0:     points += 1
        if maxp == 0: return 3.0
        return round(1.0 + (points / maxp) * 4.0, 2)

    def _score_macro(self, macro: dict) -> float:
        points, maxp = 0.0, 0.0
        rate = macro.get("fed_funds_rate")
        if rate is not None:
            maxp += 3
            if rate < 2.0: points += 3
            elif rate < 4.0: points += 2
            elif rate < 6.0: points += 1
        un = macro.get("unemployment")
        if un is not None:
            maxp += 2
            if un < 4.5: points += 2
            elif un < 6.0: points += 1
        cs = macro.get("consumer_sentiment")
        if cs is not None:
            maxp += 2
            if cs > 80: points += 2
            elif cs > 60: points += 1
        if maxp == 0: return 3.0
        return round(1.0 + (points / maxp) * 4.0, 2)

    def _score_risk(self, tech: dict, fund: dict) -> float:
        points, maxp = 0.0, 0.0
        vol = tech.get("volatility_30d")
        if vol is not None:
            maxp += 3
            if vol < 0.02: points += 3
            elif vol < 0.05: points += 2
            elif vol < 0.10: points += 1
        mcap = fund.get("market_cap")
        if mcap is not None:
            maxp += 2
            if mcap > 100e9: points += 2
            elif mcap > 10e9: points += 1
        beta = fund.get("beta")
        if beta is not None:
            maxp += 2
            if beta < 0.8: points += 2
            elif beta < 1.2: points += 1
        if maxp == 0: return 3.0
        return round(1.0 + (points / maxp) * 4.0, 2)

    def _score_sentiment(self, tech: dict) -> float:
        points, maxp = 0.0, 0.0
        rsi = tech.get("rsi")
        if rsi is not None:
            maxp += 2
            if 45 <= rsi <= 55: points += 2
            elif 35 <= rsi < 45 or 55 < rsi <= 65: points += 1
        vol, avg = tech.get("volume"), tech.get("avg_volume_20d")
        if vol is not None and avg is not None:
            maxp += 1
            if vol > avg: points += 1
        ch1m = tech.get("price_change_1m")
        if ch1m is not None:
            maxp += 2
            if ch1m > 0.05: points += 2
            elif ch1m > 0:  points += 1
        if maxp == 0: return 3.0
        return round(1.0 + (points / maxp) * 4.0, 2)

    def _recommend(self, score: float) -> str:
        if score >= 4.0: return "Strong Buy"
        if score >= 3.5: return "Buy"
        if score >= 3.0: return "Moderate Buy"
        if score >= 2.5: return "Hold"
        if score >= 2.0: return "Moderate Sell"
        if score >= 1.5: return "Sell"
        return "Strong Sell"

# =============================================================================
# Notion Client — explicit per-DB props (no overrides forwarded)
# =============================================================================
class NotionClient:
    def __init__(self, api_key: str, analyses_db_id: str, history_db_id: str):
        self.api_key = api_key
        self.analyses_db_id = analyses_db_id
        self.history_db_id  = history_db_id
        self.headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "Notion-Version": "2022-06-28"}

    def sync_to_notion(self, ticker: str, data: dict, scores: dict):
        print("\n" + "="*60)
        print(f"Syncing {ticker} to Notion...")
        print("="*60)

        props_analyses = self._build_properties(ticker, data, scores, "analyses")
        analyses_page_id = self._upsert_analyses(ticker, props_analyses)
        print("✅ Stock Analyses: " + ("Updated" if analyses_page_id else "Created"))

        props_history  = self._build_properties(ticker, data, scores, "history")
        history_page_id = self._create_history(ticker, data["timestamp"], props_history)
        print("✅ Stock History: Created new entry")

        print("="*60 + "\n")
        return analyses_page_id, history_page_id

    def _upsert_analyses(self, ticker: str, props: dict) -> Optional[str]:
        page_id = self._find_by_ticker(self.analyses_db_id, ticker, prop_type="title")
        if page_id:
            url = f"https://api.notion.com/v1/pages/{page_id}"
            r = requests.patch(url, headers=self.headers, json={"properties": props}, timeout=40)
        else:
            url = "https://api.notion.com/v1/pages"
            r = requests.post(url, headers=self.headers, json={"parent": {"database_id": self.analyses_db_id}, "properties": props}, timeout=40)
        if r.status_code in (200, 201):
            try: return r.json().get("id")
            except Exception: return None
        print(f"[Notion] Analyses upsert {r.status_code} {r.text[:300]}")
        return None

    def _create_history(self, ticker: str, ts: datetime, props: dict) -> Optional[str]:
        ts_str = ts.strftime("%Y-%m-%d %I:%M %p")
        props = dict(props)  # shallow copy
        props["Name"] = {"title": [{"text": {"content": f"{ticker} - {ts_str}"}}]}
        url = "https://api.notion.com/v1/pages"
        r = requests.post(url, headers=self.headers, json={"parent": {"database_id": self.history_db_id}, "properties": props}, timeout=40)
        if r.status_code in (200, 201):
            try: return r.json().get("id")
            except Exception: return None
        print(f"[Notion] History create {r.status_code} {r.text[:300]}")
        return None

    def _find_by_ticker(self, database_id: str, ticker: str, prop_type: str) -> Optional[str]:
        url = f"https://api.notion.com/v1/databases/{database_id}/query"
        body = {"filter": {"property": "Ticker", prop_type: {"equals": ticker}}, "page_size": 1}
        try:
            r = requests.post(url, headers=self.headers, json=body, timeout=40)
            if r.status_code == 200:
                res = r.json().get("results") or []
                if res: return res[0].get("id")
        except Exception:
            pass
        return None

    def _build_properties(self, ticker: str, data: dict, scores: dict, db_type: str) -> dict:
        tech = data["technical"]; fund = data["fundamental"]; ts = data["timestamp"]
        total_fields = 28
        available = sum([
            1 if tech.get("current_price") else 0,
            1 if tech.get("ma_50") else 0,
            1 if tech.get("ma_200") else 0,
            1 if tech.get("rsi") else 0,
            1 if tech.get("macd") else 0,
            1 if tech.get("macd_signal") else 0,
            1 if tech.get("volume") else 0,
            1 if tech.get("avg_volume_20d") else 0,
            1 if tech.get("volatility_30d") else 0,
            1 if tech.get("price_change_1d") else 0,
            1 if tech.get("price_change_5d") else 0,
            1 if tech.get("price_change_1m") else 0,
            1 if fund.get("market_cap") else 0,
            1 if fund.get("pe_ratio") else 0,
            1 if fund.get("eps") else 0,
            1 if fund.get("revenue_ttm") else 0,
            1 if fund.get("debt_to_equity") is not None else 0,
            1 if fund.get("beta") else 0,
            1 if fund.get("52_week_high") else 0,
            1 if fund.get("52_week_low") else 0,
        ])
        completeness = available / total_fields
        grade = "A - Excellent" if completeness >= 0.90 else "B - Good" if completeness >= 0.75 else "C - Fair" if completeness >= 0.60 else "D - Poor"
        confidence = "High" if completeness >= 0.85 else "Medium-High" if completeness >= 0.70 else "Medium" if completeness >= 0.55 else "Low"

        props: Dict[str, Any] = {}
        if db_type == "analyses":
            props["Ticker"] = {"title": [{"text": {"content": ticker}}]}
        else:
            props["Ticker"] = {"rich_text": [{"text": {"content": ticker}}]}

        if fund.get("company_name"):
            props["Company Name"] = {"rich_text": [{"text": {"content": str(fund["company_name"])}}]}
        props["Analysis Date"] = {"date": {"start": ts.astimezone(timezone.utc).isoformat()}}
        if tech.get("current_price") is not None:
            props["Current Price"] = {"number": float(tech["current_price"])}

        props["Composite Score"]   = {"number": float(scores.get("composite", 0))}
        props["Technical Score"]   = {"number": float(scores.get("technical", 0))}
        props["Fundamental Score"] = {"number": float(scores.get("fundamental", 0))}
        props["Macro Score"]       = {"number": float(scores.get("macro", 0))}
        props["Risk Score"]        = {"number": float(scores.get("risk", 0))}
        props["Sentiment Score"]   = {"number": float(scores.get("sentiment", 0))}

        props["Recommendation"]     = {"select": {"name": scores.get("recommendation", "Hold")}}
        props["Confidence"]         = {"select": {"name": confidence}}
        props["Data Quality Grade"] = {"select": {"name": grade}}
        props["Data Completeness"]  = {"number": round(float(completeness), 2)}
        props["Protocol Version"]   = {"rich_text": [{"text": {"content": VERSION}}]}

        if tech.get("ma_50") is not None:            props["50 Day MA"]         = {"number": round(float(tech["ma_50"]), 2)}
        if tech.get("ma_200") is not None:           props["200 Day MA"]        = {"number": round(float(tech["ma_200"]), 2)}
        if tech.get("rsi") is not None:              props["RSI"]               = {"number": round(float(tech["rsi"]), 1)}
        if tech.get("macd") is not None:             props["MACD"]              = {"number": round(float(tech["macd"]), 2)}
        if tech.get("macd_signal") is not None:      props["MACD Signal"]       = {"number": round(float(tech["macd_signal"]), 2)}
        if tech.get("volume") is not None:           props["Volume"]            = {"number": int(float(tech["volume"]))}
        if tech.get("avg_volume_20d") is not None:   props["Avg Volume (20D)"]  = {"number": round(float(tech["avg_volume_20d"]), 1)}
        if tech.get("volatility_30d") is not None:   props["Volatility (30D)"]  = {"number": round(float(tech["volatility_30d"]), 4)}
        if tech.get("price_change_1d") is not None:  props["Price Change (1D)"] = {"number": round(float(tech["price_change_1d"]), 4)}
        if tech.get("price_change_5d") is not None:  props["Price Change (5D)"] = {"number": round(float(tech["price_change_5d"]), 4)}
        if tech.get("price_change_1m") is not None:  props["Price Change (1M)"] = {"number": round(float(tech["price_change_1m"]), 4)}
        if tech.get("volume") is not None and tech.get("avg_volume_20d") not in (None, 0):
            volchg = (float(tech["volume"]) - float(tech["avg_volume_20d"])) / float(tech["avg_volume_20d"])
            props["Volume Change"] = {"number": round(volchg, 4)}

        if fund.get("market_cap") is not None:     props["Market Cap"]      = {"number": round(float(fund["market_cap"]), 2)}
        if fund.get("pe_ratio") is not None:       props["P/E Ratio"]       = {"number": round(float(fund["pe_ratio"]), 2)}
        if fund.get("eps") is not None:            props["EPS"]             = {"number": round(float(fund["eps"]), 2)}
        if fund.get("revenue_ttm") is not None:    props["Revenue (TTM)"]   = {"number": round(float(fund["revenue_ttm"]), 0)}
        if fund.get("debt_to_equity") is not None: props["Debt to Equity"]  = {"number": round(float(fund["debt_to_equity"]), 2)}
        if fund.get("beta") is not None:           props["Beta"]            = {"number": round(float(fund["beta"]), 2)}
        if fund.get("52_week_high") is not None:   props["52 Week High"]    = {"number": round(float(fund["52_week_high"]), 2)}
        if fund.get("52_week_low") is not None:    props["52 Week Low"]     = {"number": round(float(fund["52_week_low"]), 2)}

        total_calls = sum((data.get("api_calls", {}).get(k) or 0) for k in ("polygon", "alpha_vantage", "fred"))
        props["API Calls Used"] = {"number": int(total_calls)}

        patt = data.get("pattern")
        if isinstance(patt, dict):
            allowed = {"🚀 Extremely Bullish","📈 Bullish","✋ Neutral","📉 Bearish","🚨 Extremely Bearish"}
            if patt.get("score") is not None:
                props["Pattern Score"] = {"number": float(patt["score"])}
            sig = patt.get("signal")
            if isinstance(sig, str) and sig in allowed:
                props["Pattern Signal"] = {"select": {"name": sig}}
            det = patt.get("detected") or []
            if isinstance(det, list):
                props["Detected Patterns"] = {"rich_text": [{"text": {"content": ", ".join(det)}}]}

        return props

# =============================================================================
# Orchestrator
# =============================================================================
def analyze_and_sync_to_notion(ticker: str):
    print("\n" + "="*60)
    print(f"STOCK ANALYZER {VERSION} — HYBRID DUAL‑API")
    print("="*60)
    print(f"Ticker: {ticker}")
    print(f"Timestamp: {datetime.now(PACIFIC_TZ).strftime('%Y-%m-%d %I:%M %p %Z')}")

    polygon = PolygonClient(POLYGON_API_KEY)
    alpha   = AlphaVantageClient(ALPHA_VANTAGE_API_KEY)
    fred    = FREDClient(FRED_API_KEY)
    collector = DataCollector(polygon, alpha, fred)
    scorer    = StockScorer()
    notion    = NotionClient(NOTION_API_KEY, STOCK_ANALYSES_DB_ID, STOCK_HISTORY_DB_ID)

    data = collector.collect_all_data(ticker)

    tech = data.get("technical", {}) or {}
    if tech:
        p_score, p_signal, patterns = compute_pattern_score(tech)
        data["pattern"] = {"score": p_score, "signal": p_signal, "detected": patterns}
        print(f"Pattern → score={p_score}, signal={p_signal}, detected={patterns}")
    else:
        print("Pattern → skipped (no technical data).")

    print("\nCalculating scores...")
    scores = scorer.calculate_scores(data)

    print("\n" + "="*60)
    print("SCORES")
    print("="*60)
    print(f"Composite:  {scores['composite']:.2f} — {scores['recommendation']}")
    print(f"Technical:  {scores['technical']:.2f}")
    print(f"Fundamental:{scores['fundamental']:.2f}")
    print(f"Macro:      {scores['macro']:.2f}")
    print(f"Risk:       {scores['risk']:.2f}")
    print(f"Sentiment:  {scores['sentiment']:.2f} (not weighted)")
    print("="*60 + "\n")

    notion.sync_to_notion(ticker, data, scores)

    print("\n" + "="*60)
    print(f"✅ Analysis complete for {ticker}! — {VERSION}")
    print("="*60 + "\n")

# =============================================================================
# EXECUTION
# =============================================================================
# Change ticker as needed
analyze_and_sync_to_notion("AMZN")