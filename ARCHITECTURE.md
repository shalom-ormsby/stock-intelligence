# Stock Intelligence Architecture

**Version:** 1.0.0-beta.1
**Last Updated:** October 31, 2025
**Status:** Production (Vercel deployment)

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture Diagram](#architecture-diagram)
4. [Component Structure](#component-structure)
5. [Data Flow](#data-flow)
6. [API Endpoints](#api-endpoints)
7. [External Integrations](#external-integrations)
8. [Rate Limiting Architecture](#rate-limiting-architecture)
9. [Security Model](#security-model)
10. [Deployment Architecture](#deployment-architecture)
11. [Configuration](#configuration)
12. [Design Decisions](#design-decisions)

---

## System Overview

Stock Intelligence is a **serverless backend system** that provides automated stock analysis using technical and fundamental data. It's designed as a personal decision-support tool integrated with Notion.

**Core Capabilities:**
- Real-time stock analysis (technical + fundamental indicators)
- Composite scoring algorithm (0-100 scale)
- Pattern matching and trend detection
- Rate-limited API access (10 analyses per user per day)
- Session-based bypass code system
- Notion database integration

**Design Philosophy:** *Impeccable but simple.* Built for daily stock analyses ahead of earnings, not enterprise-scale deployment.

---

## Technology Stack

### Runtime & Platform
- **Platform:** Vercel Serverless Functions
- **Runtime:** Node.js 18+
- **Language:** TypeScript 5.3+
- **Build System:** tsc (TypeScript compiler)

### Data Sources
- **Financial Modeling Prep (FMP)** - Stock data, fundamentals, technical indicators
- **FRED API** - Macroeconomic indicators (yield curve, VIX, etc.)
- **Upstash Redis** - Distributed state for rate limiting

### Integration Layer
- **Notion API** - Database read/write operations
- **REST APIs** - All external communication via HTTP

### Development Tools
- **ESLint** - Code linting
- **ts-node** - Local testing scripts
- **dotenv** - Environment variable management
- **Vercel CLI** - Local development server

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Notion Workspace                         │
│  ┌──────────────────┐         ┌─────────────────────────────┐  │
│  │ Stock Analyses   │────────▶│ Notion Automation           │  │
│  │ Database         │         │ (Webhook Trigger)           │  │
│  │                  │         └──────────────┬──────────────┘  │
│  │ - Ticker         │                        │                  │
│  │ - Request Flag   │                        │ POST             │
│  │ - Metrics        │                        │ /api/webhook     │
│  └──────────────────┘                        │                  │
└──────────────────────────────────────────────┼──────────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Vercel Serverless                           │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                      API Endpoints                          │ │
│  │  ┌──────────┐  ┌─────────┐  ┌────────┐  ┌────────────┐   │ │
│  │  │ /analyze │  │ /webhook│  │ /usage │  │  /bypass   │   │ │
│  │  └────┬─────┘  └────┬────┘  └───┬────┘  └─────┬──────┘   │ │
│  │       │             │            │             │           │ │
│  └───────┼─────────────┼────────────┼─────────────┼───────────┘ │
│          │             │            │             │              │
│  ┌───────▼─────────────▼────────────▼─────────────▼───────────┐ │
│  │                    Core Libraries                           │ │
│  │                                                              │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │ │
│  │  │ Rate Limiter │  │ Scoring      │  │ Notion Client   │  │ │
│  │  │ - Check      │  │ - Technical  │  │ - Read Pages    │  │ │
│  │  │ - Increment  │  │ - Fundamental│  │ - Write Metrics │  │ │
│  │  │ - Bypass     │  │ - Composite  │  │ - AI Prompts    │  │ │
│  │  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘  │ │
│  │         │                 │                    │           │ │
│  │  ┌──────▼───────┐  ┌──────▼───────┐  ┌────────▼────────┐  │ │
│  │  │ FMP Client   │  │ FRED Client  │  │ Error Handler  │  │ │
│  │  │ - Quotes     │  │ - Macro Data │  │ - Logging      │  │ │
│  │  │ - Financials │  │ - Indicators │  │ - Validation   │  │ │
│  │  └──────────────┘  └──────────────┘  └─────────────────┘  │ │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌──────────────┐        ┌──────────────┐      ┌──────────────┐
│   Upstash    │        │     FMP      │      │     FRED     │
│    Redis     │        │  (Financial  │      │  (Macro      │
│              │        │     Data)    │      │  Economics)  │
│ - Rate Limit │        │              │      │              │
│ - Sessions   │        │ $22-29/mo    │      │    Free      │
│   Free Tier  │        └──────────────┘      └──────────────┘
└──────────────┘
```

---

## Component Structure

### Directory Layout

```
stock-intelligence/
├── api/                      # Vercel serverless function endpoints
│   ├── analyze.ts            # Main analysis endpoint (390 LOC)
│   ├── webhook.ts            # Notion archive webhook (180 LOC)
│   ├── bypass.ts             # Bypass code activation (115 LOC)
│   ├── usage.ts              # Usage tracking endpoint (115 LOC)
│   └── health.ts             # Health check endpoint (25 LOC)
│
├── lib/                      # Core business logic libraries
│   ├── rate-limiter.ts       # Rate limiting + bypass sessions (340 LOC)
│   ├── scoring.ts            # Score calculation algorithms (850 LOC)
│   ├── notion-client.ts      # Notion API wrapper (600 LOC)
│   ├── fmp-client.ts         # FMP API client (400 LOC)
│   ├── fred-client.ts        # FRED API client (150 LOC)
│   ├── errors.ts             # Custom error classes (180 LOC)
│   ├── logger.ts             # Logging utilities (80 LOC)
│   ├── validators.ts         # Input validation (120 LOC)
│   ├── utils.ts              # Helper functions (100 LOC)
│   ├── auth.ts               # Authentication helpers (60 LOC)
│   └── notion-poller.ts      # Notion polling logic (200 LOC)
│
├── config/                   # Configuration schemas
│   ├── scoring-config.ts     # Scoring weights and thresholds
│   └── notion-schema.ts      # Notion database property mappings
│
├── scripts/                  # Testing and utility scripts
│   ├── test-analyze.ts       # Local analysis testing (240 LOC)
│   ├── test-notion-write.ts  # Notion write testing
│   └── poll-notion.ts        # Manual polling script
│
├── docs/                     # Documentation
│   ├── RATE_LIMITING_SETUP.md
│   ├── USER_SETTINGS_PHASE1.md
│   ├── PHASE1_QUICKSTART.md
│   ├── NOTION_DATABASE_TEMPLATE.md
│   └── PHASE1_WEBHOOK_UPDATE.md
│
├── vercel.json               # Vercel configuration (CORS, timeouts)
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── .env.v1.example           # Environment variable template
└── SETUP.md                  # Setup and deployment guide
```

### Core Components

#### 1. API Layer (`/api`)
**Purpose:** Serverless function endpoints exposed via Vercel

**Key Files:**
- `analyze.ts` - Main analysis orchestrator
  - Validates input
  - Checks rate limits
  - Fetches financial data
  - Calculates scores
  - Writes to Notion
  - Returns results + rate limit info

- `webhook.ts` - Notion automation trigger for archiving
  - Receives page data from Notion
  - Moves analysis to Stock History database
  - Updates status flags

- `bypass.ts` - Bypass code activation
  - Accepts URL params or JSON body
  - Validates bypass code
  - Creates Redis session (expires midnight UTC)

- `usage.ts` - Usage tracking (no quota consumption)
  - Returns current usage count
  - Shows remaining analyses
  - Indicates bypass status

#### 2. Business Logic Layer (`/lib`)
**Purpose:** Reusable, testable business logic

**Key Files:**
- `rate-limiter.ts` - Rate limiting engine
  - Redis key management (`rate_limit:{userId}:{date}`)
  - Bypass session management (`bypass_session:{userId}`)
  - TTL-based expiry (automatic midnight UTC reset)
  - Graceful degradation on Redis failure

- `scoring.ts` - Scoring algorithms
  - Technical score calculation (0-100)
  - Fundamental score calculation (0-100)
  - Composite score weighting
  - Pattern matching logic

- `notion-client.ts` - Notion API wrapper
  - Page read operations
  - Property updates (batch writes)
  - AI prompt execution
  - Database queries

- `fmp-client.ts` - Financial data fetching
  - Real-time quotes
  - Financial statements
  - Technical indicators
  - Profile/company info

- `fred-client.ts` - Macro data fetching
  - Yield curve (DGS10, DGS2)
  - VIX volatility index
  - Economic indicators

- `errors.ts` - Custom error classes
  - `StockIntelligenceError` (base class)
  - `RateLimitError` (429 status)
  - `ValidationError` (400 status)
  - `NotionError` (Notion API failures)
  - User-friendly error messages

#### 3. Configuration Layer (`/config`)
**Purpose:** Centralized configuration schemas

- `scoring-config.ts` - Scoring weights, thresholds, boundaries
- `notion-schema.ts` - Database property name mappings

---

## Data Flow

### Primary Analysis Flow

```
1. User Action (Notion)
   └─▶ Set "Request Analysis" = true in Stock Analyses database

2. Notion Automation
   └─▶ Trigger webhook: POST /api/webhook
       Body: { ticker, pageId, userId, ... }

3. Rate Limit Check
   └─▶ RateLimiter.checkAndIncrement(userId)
       ├─▶ Check bypass session (Redis)
       ├─▶ Check current count (Redis)
       └─▶ Allow or reject (429 error)

4. Data Fetching (Parallel)
   ├─▶ FMP Client: Quote, financials, technicals
   ├─▶ FRED Client: Macro indicators
   └─▶ Wait for all responses

5. Score Calculation
   ├─▶ Calculate technical score (0-100)
   ├─▶ Calculate fundamental score (0-100)
   ├─▶ Calculate composite score (weighted)
   └─▶ Detect patterns (breakout, reversal, etc.)

6. Notion Write
   ├─▶ Update page properties (batch write)
   ├─▶ Trigger AI analysis prompt
   └─▶ Set "Request Analysis" = false

7. Response
   └─▶ Return JSON with scores + rate limit info
```

### Bypass Code Flow

```
1. User Input
   └─▶ GET /api/bypass?userId=XXX&code=YYY
       (Or POST with JSON body)

2. Code Validation
   ├─▶ Extract code from URL params or body
   ├─▶ Compare to env var (RATE_LIMIT_BYPASS_CODE)
   └─▶ Accept or reject

3. Session Creation
   └─▶ Redis SET bypass_session:{userId} = "1"
       EXPIREAT = next_midnight_UTC

4. Future Requests
   └─▶ RateLimiter checks session first
       If exists → unlimited access
       If expired → normal rate limiting
```

### Usage Check Flow

```
1. User Request
   └─▶ GET /api/usage?userId=XXX

2. Bypass Check
   ├─▶ Check Redis for active session
   └─▶ If bypassed → return { remaining: 999 }

3. Normal Count
   ├─▶ GET rate_limit:{userId}:{date}
   └─▶ Return { used: N, remaining: 10-N }

4. Response
   └─▶ JSON with usage data (no quota consumed)
```

---

## API Endpoints

### `/api/analyze` (POST)
**Purpose:** Execute stock analysis and return results

**Request:**
```json
{
  "ticker": "AAPL",
  "userId": "user-123",
  "pageId": "notion-page-id-xyz" (optional)
}
```

**Response (200):**
```json
{
  "success": true,
  "ticker": "AAPL",
  "compositeScore": 72.5,
  "technicalScore": 68.0,
  "fundamentalScore": 77.0,
  "recommendation": "HOLD",
  "pattern": "CONSOLIDATION",
  "metrics": { /* full data object */ },
  "rateLimit": {
    "remaining": 7,
    "total": 10,
    "resetAt": "2025-11-01T00:00:00.000Z",
    "bypassed": false
  }
}
```

**Response (429 - Rate Limit):**
```json
{
  "success": false,
  "error": {
    "code": "USER_RATE_LIMIT_EXCEEDED",
    "message": "Daily analysis limit reached. Your limit will reset at Oct 31, 11:59 PM PT.",
    "statusCode": 429
  }
}
```

**Headers:**
- `X-RateLimit-Remaining` - Analyses remaining
- `X-RateLimit-Total` - Total daily limit
- `X-RateLimit-Reset` - ISO 8601 reset timestamp

**Configuration:**
- Timeout: 300 seconds (5 minutes)
- CORS: Enabled (all origins)

---

### `/api/bypass` (GET/POST)
**Purpose:** Activate bypass code for unlimited analyses

**Method 1: URL Parameters (GET)**
```bash
GET /api/bypass?userId=user-123&code=secret-bypass-code
```

**Method 2: JSON Body (POST)**
```json
POST /api/bypass
{
  "userId": "user-123",
  "code": "secret-bypass-code"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Bypass code activated successfully",
  "expiresAt": "2025-11-01T00:00:00.000Z"
}
```

**Response (400 - Invalid Code):**
```json
{
  "success": false,
  "error": "Invalid bypass code"
}
```

**Configuration:**
- Timeout: 60 seconds (default)
- Session expires: Midnight UTC

---

### `/api/usage` (GET)
**Purpose:** Check current usage without consuming quota

**Request:**
```bash
GET /api/usage?userId=user-123
```

**Response (200):**
```json
{
  "success": true,
  "usage": {
    "used": 3,
    "remaining": 7,
    "total": 10,
    "resetAt": "2025-11-01T00:00:00.000Z",
    "bypassed": false
  }
}
```

**Response (Bypassed):**
```json
{
  "success": true,
  "usage": {
    "used": 0,
    "remaining": 999,
    "total": 10,
    "resetAt": "2025-11-01T00:00:00.000Z",
    "bypassed": true
  }
}
```

---

### `/api/webhook` (POST)
**Purpose:** Notion automation trigger for archiving

**Request:**
```json
{
  "ticker": "AAPL",
  "pageId": "notion-page-id-xyz",
  "action": "archive"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Page archived successfully"
}
```

**Configuration:**
- Timeout: 60 seconds
- Called by: Notion automation ("Send to History" button)

---

### `/api/health` (GET)
**Purpose:** Health check endpoint

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2025-10-31T12:00:00.000Z",
  "version": "1.0.0-beta.1"
}
```

**Configuration:**
- Timeout: 10 seconds
- No authentication required

---

## External Integrations

### 1. Upstash Redis
**Purpose:** Distributed state for rate limiting

**Connection:**
- REST API (no TCP connections)
- Endpoint: `UPSTASH_REDIS_REST_URL`
- Auth: Bearer token (`UPSTASH_REDIS_REST_TOKEN`)

**Data Stored:**
- Rate limit counters: `rate_limit:{userId}:{YYYY-MM-DD}`
- Bypass sessions: `bypass_session:{userId}`

**Commands Used:**
- `GET` - Retrieve count/session
- `INCR` - Increment counter
- `EXPIREAT` - Set TTL to midnight UTC
- `SET` + `EXPIREAT` - Create session with expiry

**Free Tier Limits:**
- 10,000 commands per day
- 256 MB storage
- Automatic eviction (LRU)

**Failure Handling:**
- Graceful degradation (fails open)
- Logs error but allows request
- No Redis = no rate limiting (intentional)

---

### 2. Financial Modeling Prep (FMP)
**Purpose:** Stock data provider

**Endpoint:** `https://financialmodelingprep.com/api/v3/`

**Data Fetched:**
- Real-time quotes (`/quote/{ticker}`)
- Financial statements (`/income-statement/{ticker}`)
- Balance sheets (`/balance-sheet-statement/{ticker}`)
- Technical indicators (`/technical_indicator/daily/{ticker}`)
- Company profile (`/profile/{ticker}`)

**Pricing:**
- Starter: $22/month
- Professional: $29/month (current plan)

**Rate Limits:**
- 250 requests per minute
- 10,000 requests per day

**Error Handling:**
- Retry with exponential backoff
- Custom `APIResponseError` class
- Logs all API failures

---

### 3. FRED API (Federal Reserve Economic Data)
**Purpose:** Macroeconomic indicators

**Endpoint:** `https://api.stlouisfed.org/fred/series/observations`

**Data Fetched:**
- 10-Year Treasury Yield (`DGS10`)
- 2-Year Treasury Yield (`DGS2`)
- VIX Volatility Index (`VIXCLS`)
- Unemployment Rate (`UNRATE`)

**Pricing:** Free (public API)

**Rate Limits:**
- 120 requests per minute
- No daily limit

**Error Handling:**
- Falls back gracefully on failure
- Macros are optional for analysis

---

### 4. Notion API
**Purpose:** Database integration and UI

**Connection:**
- Official SDK: `@notionhq/client`
- Auth: Integration token (`NOTION_API_TOKEN`)

**Operations:**
- Read pages (`pages.retrieve`)
- Update properties (`pages.update`)
- Query databases (`databases.query`)
- Execute AI prompts (via page comments)

**Databases Used:**
- **Stock Analyses** - Active analysis workspace
  - Ticker (title)
  - Request Analysis (checkbox)
  - Composite Score (number)
  - Technical Score (number)
  - Fundamental Score (number)
  - Recommendation (select)
  - Pattern (select)
  - Last Updated (date)
  - Content Status (select)

- **Stock History** - Archive of past analyses
  - Same schema as Stock Analyses
  - Read-only for user

**Rate Limits:**
- 3 requests per second (per integration)
- Retry-After header respected

**Error Handling:**
- Exponential backoff on 429 errors
- Custom `NotionError` class
- Detailed logging

---

## Rate Limiting Architecture

### Design Goals
1. **User-level quotas** - 10 analyses per user per day
2. **Distributed state** - Works across serverless instances
3. **Automatic reset** - Midnight UTC daily reset
4. **Bypass mechanism** - Session-based unlimited access
5. **Graceful degradation** - Fails open if Redis unavailable

### Implementation

#### Redis Key Schema
```
rate_limit:{userId}:{YYYY-MM-DD}     # Daily counter
  - Value: Integer (0-10)
  - TTL: Expires at midnight UTC
  - Commands: INCR, GET, EXPIREAT

bypass_session:{userId}              # Bypass session
  - Value: "1" (existence check only)
  - TTL: Expires at midnight UTC
  - Commands: SET, GET, EXPIREAT
```

#### Rate Limit Check Algorithm
```typescript
async checkAndIncrement(userId: string): Promise<RateLimitResult> {
  // Priority 1: Check for active bypass session
  if (await hasActiveBypass(userId)) {
    return { allowed: true, remaining: 999, bypassed: true };
  }

  // Priority 2: Check if rate limiting is disabled (dev mode)
  if (!this.enabled) {
    return { allowed: true, remaining: 999, bypassed: false };
  }

  // Priority 3: Normal rate limiting
  const key = getRateLimitKey(userId);  // rate_limit:user-123:2025-10-31
  const count = await getCount(key);     // GET from Redis

  if (count >= maxAnalyses) {
    return { allowed: false, remaining: 0 };
  }

  // Increment counter and set expiry
  await increment(key, resetAt);         // INCR + EXPIREAT
  return { allowed: true, remaining: maxAnalyses - (count + 1) };
}
```

#### Bypass Code Activation
```typescript
async activateBypass(userId: string, code: string): Promise<boolean> {
  // Validate code against environment variable
  if (code !== process.env.RATE_LIMIT_BYPASS_CODE) {
    return false;
  }

  // Create session with expiry at midnight UTC
  const key = `bypass_session:${userId}`;
  const midnight = getNextMidnightUTC();

  await redis.set(key, "1");
  await redis.expireat(key, Math.floor(midnight.getTime() / 1000));

  return true;
}
```

#### Midnight UTC Reset
```typescript
function getNextMidnightUTC(): Date {
  const now = new Date();
  const tomorrow = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0, 0
    )
  );
  return tomorrow;
}
```

### Configuration
```bash
# Enable/disable rate limiting
RATE_LIMIT_ENABLED=true

# Daily quota per user
RATE_LIMIT_MAX_ANALYSES=10

# Bypass code (change to revoke all sessions)
RATE_LIMIT_BYPASS_CODE=your-secret-code

# Upstash Redis connection
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token
```

### Error Handling

**Scenario 1: Redis unavailable**
```typescript
try {
  // Attempt rate limit check
} catch (error) {
  log(LogLevel.ERROR, 'Redis connection failed', { error });
  // Fail open - allow request
  return { allowed: true, remaining: 999 };
}
```

**Scenario 2: Rate limit exceeded**
```typescript
if (!rateLimitResult.allowed) {
  throw new RateLimitError(rateLimitResult.resetAt);
  // Returns 429 status with user-friendly message
}
```

**Scenario 3: Invalid bypass code**
```typescript
if (code !== expectedCode) {
  return res.status(400).json({
    success: false,
    error: 'Invalid bypass code'
  });
}
```

---

## Security Model

### Authentication
**Current:** API key-based (lightweight)
- Notion webhook sends API key in header
- Environment variable: `API_KEY`
- Validated in `lib/auth.ts`

**User Identification:**
- `userId` extracted from request
- Notion page properties or query params
- Used for rate limiting and tracking

### Authorization
**Rate Limiting:** Primary access control mechanism
- 10 analyses per user per day
- Bypass code for admin/beta testers
- No payment or subscription system (yet)

**Notion Integration:**
- Integration token stored in environment
- Scoped to specific workspace
- No user credentials stored

### Secrets Management
**Vercel Environment Variables:**
- API keys (FMP, FRED, Notion)
- Redis credentials (Upstash)
- Bypass code
- All secrets encrypted at rest

**Local Development:**
- `.env` file (gitignored)
- `.env.v1.example` template provided
- Secrets never committed to git

### Input Validation
**Ticker Symbols:**
- Alphanumeric + hyphen only
- Max length: 10 characters
- Uppercase normalization

**User IDs:**
- Alphanumeric + hyphen + underscore
- Max length: 100 characters
- Required for rate limiting

**Request Bodies:**
- JSON schema validation
- Type checking via TypeScript
- Zod schemas (optional validation)

### CORS Configuration
**Allowed Origins:** `*` (public API)
**Allowed Methods:** `GET, POST, OPTIONS`
**Allowed Headers:** `Content-Type, Authorization, X-API-Key`

**Rationale:** Personal tool, not sensitive data

### Error Handling
**User-Facing Errors:**
- No stack traces exposed
- Generic error messages
- HTTP status codes (400, 429, 500)

**Internal Logging:**
- Full error details logged
- Vercel logging dashboard
- No PII in logs

---

## Deployment Architecture

### Platform: Vercel Serverless

**Function Configuration:**
```json
{
  "functions": {
    "api/analyze.ts": { "maxDuration": 300 },  // 5 minutes
    "api/webhook.ts": { "maxDuration": 60 },    // 1 minute
    "api/health.ts": { "maxDuration": 10 }      // 10 seconds
  }
}
```

**Build Process:**
1. TypeScript compilation (`tsc --noEmit` for type checking)
2. Vercel packages functions automatically
3. Deploy to edge network (global CDN)

**Cold Start Optimization:**
- Minimal dependencies
- Lazy loading of heavy libraries
- Connection pooling avoided (Redis REST API)

### CI/CD Pipeline

**GitHub Integration:**
```
1. Push to main branch (GitHub Desktop or CLI)
   └─▶ Triggers Vercel deployment

2. Vercel Build
   ├─▶ Install dependencies (npm install)
   ├─▶ Type check (npm run type-check)
   ├─▶ Package functions
   └─▶ Deploy to production

3. Deployment Complete (~30-60 seconds)
   └─▶ Health check automatically validates
```

**Rollback:**
- Vercel dashboard allows instant rollback
- Each deployment preserved for 30 days
- Git history allows code-level rollback

### Environment Management

**Production (Vercel):**
- All secrets in Vercel dashboard
- Environment variables encrypted
- Accessible only to functions at runtime

**Local Development:**
- `.env` file with dev credentials
- `vercel dev` command for testing
- Test scripts (`npm run test:analyze`)

### Monitoring

**Vercel Dashboard:**
- Function execution logs
- Error rates and stack traces
- Performance metrics (duration, cold starts)
- Rate limit tracking (manual via logs)

**Logging Strategy:**
- `LogLevel.INFO` - Request lifecycle
- `LogLevel.WARN` - Graceful failures (Redis down)
- `LogLevel.ERROR` - Unexpected errors

---

## Configuration

### Environment Variables

```bash
# === Core API Keys ===
NOTION_API_TOKEN=secret_xxxxxxxxxxxxx
FMP_API_KEY=your_fmp_api_key_here
FRED_API_KEY=your_fred_api_key_here

# === Notion Database IDs ===
NOTION_ANALYSES_DB_ID=xxxxxxxxxxxxxxxx
NOTION_HISTORY_DB_ID=xxxxxxxxxxxxxxxx

# === Rate Limiting (Upstash Redis) ===
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_redis_token_here
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_ANALYSES=10
RATE_LIMIT_BYPASS_CODE=your_bypass_code_here

# === Authentication ===
API_KEY=your_api_key_here

# === Optional: Development ===
NODE_ENV=development
LOG_LEVEL=INFO
```

### Scoring Configuration

**File:** `config/scoring-config.ts`

**Weights:**
- Technical Score: 40%
- Fundamental Score: 60%

**Boundaries:**
- Strong Buy: 80-100
- Buy: 70-79
- Hold: 50-69
- Sell: 30-49
- Strong Sell: 0-29

**Customizable:** Edit config file and redeploy

### Notion Schema

**File:** `config/notion-schema.ts`

**Property Mappings:**
- Ticker → Title property
- Scores → Number properties
- Recommendation → Select property
- Pattern → Select property

**Flexible:** Supports custom property names

---

## Design Decisions

### 1. **Serverless Architecture**
**Decision:** Use Vercel serverless functions instead of long-running servers

**Rationale:**
- No server maintenance required
- Auto-scaling (0 to N instances)
- Pay only for usage (~$0/month at current scale)
- Global edge network (low latency)

**Trade-offs:**
- Cold starts (~1-2 seconds)
- No persistent connections (hence Redis REST API)
- Function timeout limits (300 seconds max on Pro)

---

### 2. **Upstash Redis for Rate Limiting**
**Decision:** Use Upstash Redis instead of Vercel KV or Edge Config

**Rationale:**
- Better free tier (10,000 commands vs 1,000 requests)
- REST API perfect for serverless (no TCP connections)
- Built-in TTL expiry (automatic midnight reset)
- Industry-standard Redis commands

**Alternatives Considered:**
- Vercel KV: More expensive, similar features
- Edge Config: Read-only, not suitable for counters
- Database: Too slow, overkill for counters

---

### 3. **Session-Based Bypass Codes**
**Decision:** Store bypass sessions in Redis instead of passing code with every request

**Rationale:**
- Better UX (enter code once, use all day)
- More secure (code not exposed in URLs/logs repeatedly)
- Easy revocation (change environment variable)
- Automatic expiry (midnight UTC)

**Alternatives Considered:**
- Stateless JWT: More complex, harder to revoke
- API key per user: Requires user management system
- No bypass: Blocks admin testing

---

### 4. **TypeScript Over JavaScript**
**Decision:** Use TypeScript for all code

**Rationale:**
- Type safety catches errors at compile time
- Better IDE support (autocomplete, refactoring)
- Self-documenting code (types as documentation)
- Industry standard for production systems

**Trade-offs:**
- Compilation step required
- Slight learning curve

---

### 5. **Notion as Primary UI**
**Decision:** Use Notion databases instead of building custom web UI

**Rationale:**
- User already lives in Notion
- Zero frontend maintenance
- Flexible schema (Notion handles CRUD)
- AI integration built-in (Notion AI)

**Trade-offs:**
- Notion API rate limits (3 req/sec)
- Webhook limitations (discovered in v1.0.1)
- Dependent on third-party platform

---

### 6. **Fail Open on Redis Errors**
**Decision:** Allow requests if Redis is unavailable

**Rationale:**
- Personal tool, not mission-critical
- Better UX than hard failures
- Temporary outages shouldn't block usage

**Alternatives Considered:**
- Fail closed: More secure but worse UX
- Queue requests: Too complex for personal tool

---

### 7. **FMP + FRED Over Polygon/Alpha Vantage**
**Decision:** Consolidated to FMP for stock data + FRED for macros

**Rationale:**
- Single provider simplifies integration
- FMP has all needed data (technical + fundamental)
- FRED is authoritative for macro data (Federal Reserve)
- Cost-effective ($22-29/month vs $200+ for Polygon)

**Previous Stack (v0.x):**
- Polygon + Alpha Vantage + FRED
- More expensive, more API keys to manage

---

### 8. **No Frontend Framework (Yet)**
**Decision:** Backend-only system, Notion for UI

**Rationale:**
- Simplicity (no React/Next.js complexity)
- Faster development (focus on API logic)
- User preference (Notion-native workflow)

**Future Consideration:**
- v1.0.1 exploring Notion-native vs HTML vs Next.js
- Phased validation approach (build simplest first)

---

### 9. **Global CORS (Allow All Origins)**
**Decision:** Allow all origins instead of whitelisting

**Rationale:**
- Public API, not sensitive data
- Simplifies Notion webhook integration
- Personal tool, not enterprise system

**Security Note:**
- Rate limiting provides primary access control
- No user credentials exposed
- All secrets server-side only

---

### 10. **Composite Scoring Model**
**Decision:** Weighted combination of technical + fundamental scores

**Rationale:**
- Balanced view (not just charts, not just financials)
- Customizable weights (60/40 current split)
- Pattern matching adds context (breakout, reversal)

**Alternative Considered:**
- ML-based scoring: Too complex, requires training data
- Single-dimension scoring: Misses important signals

---

## Future Enhancements

### v1.1: Enhanced Analysis Features
- Insider trading analysis (requires FMP Pro upgrade)
- Market regime classification (Risk-On/Risk-Off)
- Sector strength rankings
- Brave Search API for market intelligence

### v2.0: Full Automation
- Scheduled jobs (GitHub Actions/Vercel Cron)
- Autonomous portfolio monitoring
- Intelligent digest notifications
- Historical trend analysis
- Market Context dashboard

### Infrastructure
- Upstash Redis Analytics (monitoring usage patterns)
- Vercel Pro upgrade (300-second timeouts)
- CDN caching for repeated tickers
- WebSocket support for real-time updates

---

## Additional Resources

**Setup Documentation:**
- [SETUP.md](SETUP.md) - Environment setup and deployment
- [TESTING.md](TESTING.md) - Testing procedures and validation
- [ROADMAP.md](ROADMAP.md) - Project roadmap and progress

**Rate Limiting Documentation:**
- [RATE_LIMITING_SETUP.md](RATE_LIMITING_SETUP.md) - Complete Upstash setup guide
- [.env.v1.example](.env.v1.example) - Environment variable template

**User Settings Documentation:**
- [USER_SETTINGS_PHASE1.md](USER_SETTINGS_PHASE1.md) - Notion-native implementation
- [PHASE1_QUICKSTART.md](PHASE1_QUICKSTART.md) - Quick start guide
- [PHASE1_WEBHOOK_UPDATE.md](PHASE1_WEBHOOK_UPDATE.md) - Webhook blocker fix

---

**Questions or Issues?**
Contact: Shalom Ormsby
Project Repository: [GitHub](https://github.com/shalomormsby/stock-intelligence) (if applicable)
Last Updated: October 31, 2025
