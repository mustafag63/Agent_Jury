# Agent Jury

Multi-agent AI evaluation system with on-chain verdict storage. Three specialized AI agents (Feasibility, Innovation, Risk & Ethics) independently evaluate a startup case, a weighted scoring algorithm produces a final decision, and the result is saved immutably on a smart contract via MetaMask.

**Stack**: Next.js 14 · Express.js · Ethers.js v6 · Solidity 0.8.24 · OpenZeppelin UUPS · Hardhat · Pino · SQLite · Docker · Nginx · GitHub Actions

---

## Architecture Overview

```
┌─────────────┐     ┌──────────────────────────────────────────────────────────┐     ┌──────────────────┐
│   Frontend   │────▶│                       Backend                           │────▶│  Smart Contract   │
│  Next.js 14  │◀────│                    Express.js API                       │◀────│   Solidity UUPS   │
│  port: 3000  │     │                     port: 4000                          │     │  Monad Testnet    │
└─────────────┘     │                                                          │     └──────────────────┘
                    │  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌──────────┐  │
                    │  │ Gemini  │  │OpenRouter │  │ SQLite  │  │  Pino    │  │
                    │  │ LLM API │  │ LLM API  │  │   DB    │  │ Logger   │  │
                    │  └─────────┘  └──────────┘  └─────────┘  └──────────┘  │
                    └──────────────────────────────────────────────────────────┘
```

**Flow**: Connect wallet → Submit case text → 3 AI agents evaluate independently → Weighted scoring → Final verdict → User signs transaction via MetaMask → Verdict stored on-chain immutably

---

## Project Structure

```
agent_jury/
├── backend/                # Express API – multi-agent evaluation pipeline
│   ├── src/
│   │   ├── server.js              # Express bootstrap, graceful shutdown
│   │   ├── config/
│   │   │   ├── index.js           # Centralized env/config parsing
│   │   │   └── validate.js        # Startup config validation
│   │   ├── routes/
│   │   │   ├── health.js          # GET /health (uptime, memory)
│   │   │   ├── evaluate.js        # POST /evaluate (controller)
│   │   │   ├── evaluations.js     # GET/DELETE /evaluations (GDPR endpoints)
│   │   │   └── metrics.js         # GET /metrics (Prometheus + JSON)
│   │   ├── services/
│   │   │   ├── evaluation.js      # Pipeline: agents → scoring → attestation → persist
│   │   │   ├── scoring.js         # Weighted scoring + consensus analysis
│   │   │   └── attestation.js     # Cryptographic verdict signing (ECDSA)
│   │   ├── agents/
│   │   │   ├── runner.js          # Agent execution: fallback, dual-pass, bias check
│   │   │   └── prompts.js         # Versioned system/user prompt templates
│   │   ├── llm/
│   │   │   ├── client.js          # Provider dispatcher + cross-provider fallback
│   │   │   ├── gemini.js          # Google Gemini API client
│   │   │   ├── openrouter.js      # OpenRouter API client (OpenAI-compatible)
│   │   │   └── retry.js           # Exponential backoff + Retry-After support
│   │   ├── data/
│   │   │   ├── store.js           # SQLite adapter (better-sqlite3, WAL mode)
│   │   │   ├── evaluationRepo.js  # CRUD for evaluations table
│   │   │   ├── audit.js           # Immutable audit trail
│   │   │   └── privacy.js         # PII detection/redaction, retention, erasure
│   │   ├── middleware/
│   │   │   ├── auth.js            # API key authentication (timing-safe compare)
│   │   │   ├── rateLimiter.js     # Rate limiting (global + per-endpoint)
│   │   │   ├── requestId.js       # X-Request-Id generation/propagation
│   │   │   ├── requestLogger.js   # Structured HTTP logging
│   │   │   ├── sanitizer.js       # Prompt injection defense
│   │   │   └── secureHeaders.js   # Helmet + CORS
│   │   ├── observability/
│   │   │   ├── logger.js          # Pino structured JSON logger
│   │   │   └── metrics.js         # In-memory counters/histograms + Prometheus
│   │   ├── validation/
│   │   │   └── schema.js          # Zod schemas for LLM output validation
│   │   └── errors/
│   │       └── classifier.js      # HTTP error classification + metrics
│   ├── .env.example               # All configurable environment variables
│   ├── .env.d/                    # Environment-specific configs
│   │   ├── development.env
│   │   ├── staging.env
│   │   └── production.env
│   ├── Dockerfile                 # Multi-stage production image (alpine, tini)
│   ├── Dockerfile.dev             # Development image (hot-reload)
│   ├── eslint.config.js           # ESLint flat config
│   └── .prettierrc                # Prettier config
│
├── contracts/                # Solidity smart contract + Hardhat
│   ├── src/
│   │   └── AgentJury.sol          # UUPS upgradeable contract with RBAC
│   ├── test/
│   │   └── AgentJury.test.js      # Comprehensive contract tests
│   ├── scripts/
│   │   └── deploy-proxy.js        # UUPS proxy deployment script
│   ├── ignition/
│   │   └── modules/
│   │       └── AgentJury.js       # Hardhat Ignition deployment module
│   ├── hardhat.config.js          # Solidity 0.8.24, optimizer, gas reporter
│   └── .env.example               # MONAD_RPC_URL, DEPLOYER_PRIVATE_KEY
│
├── frontend/                 # Next.js 14 (App Router) UI
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.js          # Root layout: nav bar, skip-link, NetworkGuard
│   │   │   ├── page.js            # Home – demo flow overview
│   │   │   ├── globals.css        # Full CSS: a11y, skeletons, filters, responsive
│   │   │   ├── connect/page.js    # Wallet connection + edge cases
│   │   │   ├── submit/page.js     # Case input + progress bar + retry
│   │   │   ├── deliberation/page.js # Staggered agent reveal + consensus
│   │   │   ├── verdict/page.js    # Final verdict + on-chain save + tx stages
│   │   │   └── history/page.js    # Filterable, searchable, paginated history
│   │   ├── components/
│   │   │   ├── AgentCard.js       # Score bar, confidence, flags, rationale
│   │   │   ├── ErrorAlert.js      # Categorized error display + retry/dismiss
│   │   │   ├── LoadingSkeleton.js # Skeleton cards, lines, spinner
│   │   │   ├── NetworkGuard.js    # Wrong chain detection + auto-switch
│   │   │   └── WalletGuard.js     # Account change/disconnect detection
│   │   └── lib/
│   │       ├── api.js             # API client: retry, timeout, error classes
│   │       ├── contract.js        # Ethers.js: chain utils, read/write contracts
│   │       └── storage.js         # localStorage session adapter
│   ├── .env.example               # Frontend env vars
│   ├── Dockerfile                 # Multi-stage production image
│   ├── next.config.mjs            # Next.js config (strict mode)
│   └── jsconfig.json              # Path aliases (@/*)
│
├── infra/
│   └── nginx.conf            # Reverse proxy: load balancing, rate limiting
│
├── .github/workflows/
│   ├── ci.yml                # Lint, test, build, Docker image verification
│   └── deploy.yml            # Build → push to GHCR → SSH deploy
│
├── docker-compose.yml        # Multi-service: dev/staging/production profiles
└── .gitignore
```

---

## 1) Smart Contract

**Path**: `contracts/src/AgentJury.sol`  
**Solidity**: 0.8.24 · **Pattern**: UUPS Upgradeable Proxy · **Dependencies**: OpenZeppelin v5.6

### Storage (optimized)

Each verdict fits in minimal storage slots:

| Field | Type | Notes |
|-------|------|-------|
| `caseHash` | `bytes32` | keccak256 hash of case text |
| `submitter` | `address` | Wallet that signed the transaction |
| `timestamp` | `uint40` | Unix timestamp (saves 27 bytes vs uint256) |
| `feasibilityScore` | `uint8` | 0–100 |
| `innovationScore` | `uint8` | 0–100 |
| `riskScore` | `uint8` | 0–100 |
| `finalScore` | `uint8` | 0–100 |
| `status` | `VerdictStatus` | Active / Disputed / Revoked / Resolved |
| `attestationVerified` | `bool` | Backend signature verified on-chain |
| `shortVerdict` | `string` | Max 140 chars (enforced) |
| `disputeReason` | `string` | Filled when disputed |

### Roles (AccessControl)

| Role | Permissions |
|------|-------------|
| `DEFAULT_ADMIN_ROLE` | Upgrade contract, manage roles, configure settings, resolve disputes |
| `WRITER_ROLE` | Save new verdicts |
| `ATTESTOR_ROLE` | Reserved for attestation verification |
| `DISPUTER_ROLE` | Dispute active verdicts |

### Functions

| Function | Access | Description |
|----------|--------|-------------|
| `saveVerdict(...)` | `WRITER_ROLE` | Save verdict with optional attestation signature verification |
| `disputeVerdict(id, reason)` | `DISPUTER_ROLE` | Mark a verdict as disputed (Active → Disputed) |
| `revokeVerdict(id)` | Submitter or Admin | Revoke a verdict (any non-revoked → Revoked) |
| `resolveDispute(id, reinstate)` | Admin | Resolve dispute (Disputed → Resolved or Revoked) |
| `getVerdict(index)` | Public | Read single verdict by index |
| `getVerdictCount()` | Public | Total number of verdicts |
| `getVerdictsPage(offset, limit)` | Public | Paginated read |
| `getLatestVerdicts(limit)` | Public | Read N most recent verdicts |
| `getVerdictsByCaseHash(hash)` | Public | All verdicts for a given case hash |
| `getVerdictCountByCaseHash(hash)` | Public | Count verdicts for a case hash |
| `setAttestor(address)` | Admin | Set backend attestor address |
| `setAttestationRequired(bool)` | Admin | Toggle mandatory attestation |
| `setCooldown(seconds)` | Admin | Anti-spam cooldown between saves per address |

### Events (indexed for off-chain indexing)

`VerdictSaved` · `VerdictDisputed` · `VerdictRevoked` · `VerdictResolved` · `AttestorUpdated` · `AttestationRequirementUpdated` · `CooldownUpdated`

### Custom Errors (gas-efficient)

`CooldownNotElapsed` · `VerdictEmpty` · `VerdictTooLong` · `ScoreOutOfRange` · `AttestorNotSet` · `InvalidSignatureLength` · `InvalidSignature` · `IndexOutOfBounds` · `InvalidStatusTransition` · `DisputeReasonRequired` · `OnlySubmitterOrAdmin`

### Gas Optimization

- `uint40` for timestamps instead of `uint256` (saves 27 bytes per verdict)
- Packed struct fields fit into minimal storage slots
- Custom errors instead of `require` strings
- Solidity optimizer enabled (200 runs) with `viaIR`
- Gas reporter integrated (`npm run test:gas`)

---

## 2) Backend

**Runtime**: Node.js 20 · **Framework**: Express.js · **Language**: ES Modules

### API Endpoints

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| `POST` | `/evaluate` | Yes | 5/min | Submit case text for multi-agent evaluation |
| `GET` | `/health` | No | – | Server health: `{ ok, uptime_seconds, memory }` |
| `GET` | `/metrics` | No | – | Prometheus text format (counters + histograms) |
| `GET` | `/metrics/json` | No | – | Metrics snapshot as JSON |
| `GET` | `/evaluations` | Yes | 10/s | Paginated list (`?limit=20&offset=0&case_hash=0x...`) |
| `GET` | `/evaluations/:id` | Yes | 10/s | Single evaluation + audit trail |
| `DELETE` | `/evaluations/:id` | Yes | 10/s | GDPR erasure (nullifies stored data) |
| `POST` | `/evaluations/:id/redact` | Yes | 10/s | Redact PII from stored case text |
| `POST` | `/evaluations/:id/export` | Yes | 10/s | GDPR data portability (JSON download) |

### Evaluation Pipeline

```
Case Text
  │
  ├─ Input validation (length, encoding)
  ├─ Prompt injection sanitization
  ├─ PII detection (optional auto-redact)
  │
  ├─ Feasibility Agent ──┐
  ├─ Innovation Agent  ───┤  Sequential with inter-call delay
  ├─ Risk & Ethics Agent ─┘  Each: system prompt → LLM call → schema validation → dual-pass check
  │
  ├─ Weighted Scoring
  │   ├─ Feasibility × 0.45
  │   ├─ Innovation  × 0.35
  │   ├─ Risk        × 0.20 (inverted: 100 − risk)
  │   └─ Thresholds: SHIP ≥ 75 · ITERATE ≥ 50 · REJECT < 50
  │
  ├─ Consensus Analysis (std dev, spread, disagreements)
  ├─ Attestation (ECDSA signature of verdict hash)
  ├─ Persist to SQLite (evaluation + audit log)
  │
  └─ Response: { agent_results, final_verdict, attestation, consensus_analysis, meta, data_privacy }
```

### AI Agent System

Each of the 3 agents receives the same case text with a role-specific system prompt:

| Agent | Evaluates | Score Meaning |
|-------|-----------|---------------|
| **Feasibility Agent** | Technical viability, team capability, market readiness | Higher = more feasible |
| **Innovation Agent** | Novelty, differentiation, creative approach | Higher = more innovative |
| **Risk & Ethics Agent** | Regulatory risk, ethical concerns, failure modes | Higher = more risky (inverted in scoring) |

**Agent output** (validated with Zod schema):
- `score` (0–100), `confidence` (0–100), `pros[]`, `cons[]`, `rationale`
- `bias_flags[]`, `uncertainty_flags[]`
- Optional dual-pass consistency check (same input evaluated twice, scores compared)

### LLM Provider Support

| Provider | `LLM_PROVIDER` value | API Format | Example Models |
|----------|---------------------|------------|----------------|
| **OpenRouter** | `openrouter` | OpenAI-compatible (`/v1/chat/completions`) | `google/gemini-2.0-flash-001` |
| **Gemini Direct** | `gemini` | Google Generative Language API | `gemini-2.0-flash` |

- **Cross-provider fallback**: If primary provider fails, falls back to `LLM_FALLBACK_PROVIDER` with separate API key
- **Model fallback**: If primary model returns 429, falls back to `LLM_MODEL_FALLBACK`
- **Retry**: Exponential backoff with `Retry-After` header support for 429/5xx/network errors
- **Timeout**: 15s per LLM call via `AbortController`
- **Validation**: All LLM outputs parsed and validated against strict Zod JSON schema

### Security

| Layer | Implementation |
|-------|----------------|
| **Authentication** | API key via `X-API-Key` header (timing-safe comparison with `crypto.timingSafeEqual`) |
| **Rate Limiting** | `express-rate-limit`: global (100/min) + `/evaluate` (5/min), IPv6-aware |
| **Prompt Injection** | Input sanitization + hardened prompts with `<CASE_DATA>` boundary tags |
| **Secure Headers** | Helmet (CSP, HSTS, X-Content-Type-Options, X-Frame-Options) |
| **CORS** | Configurable origin whitelist via `CORS_ORIGINS` |
| **Secrets** | Private keys never logged; automatic redaction in Pino serializers |

### Data Management & Privacy

| Feature | Details |
|---------|---------|
| **Database** | SQLite (`better-sqlite3`) with WAL mode for concurrent reads |
| **Tables** | `evaluations` (full result + metadata) · `audit_log` (immutable action trail) |
| **Metadata** | `eval_id`, `prompt_version`, `model_used`, `provider_used`, `temperature`, `seed`, `dual_pass` |
| **PII Detection** | Emails, phone numbers, SSNs, credit cards, IP addresses, TC Kimlik numbers |
| **Auto-Redact** | `DATA_AUTO_REDACT_PII=true` strips PII before sending to LLM |
| **Retention** | `DATA_RETENTION_DAYS` with automatic scheduled purge |
| **GDPR/KVKK** | Right to erasure (DELETE), data portability (export), processing disclosure in every response |

### Observability

| Feature | Details |
|---------|---------|
| **Logging** | Pino JSON logger (`pino-pretty` in dev); all logs include `service`, `env`, `requestId` |
| **Tracing** | `X-Request-Id` auto-generated or forwarded; propagated through all layers |
| **Metrics** | In-memory counters/histograms: HTTP requests, LLM calls, agent runs, evaluations, errors |
| **Prometheus** | `GET /metrics` exports text format compatible with Grafana/Prometheus |
| **Error Tracking** | Every error increments `evaluation_errors_total{category, status}` counter |
| **Latency** | `agent_timings_ms` per agent included in every evaluation response |
| **Redaction** | API keys, auth headers, private keys automatically redacted from all log output |

---

## 3) Frontend

**Framework**: Next.js 14 (App Router) · **Blockchain**: Ethers.js v6 · **Styling**: Custom CSS (no framework)

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Home – demo flow overview with trust model explanation |
| `/connect` | MetaMask wallet connection with edge-case handling |
| `/submit` | Case text input → AI evaluation with progress bar |
| `/deliberation` | Staggered reveal of 3 agent evaluations + consensus analysis |
| `/verdict` | Final score/decision, trust info, on-chain save with tx stage feedback |
| `/history` | Filterable, searchable, paginated on-chain verdict history |

### Error Handling

- **7 error categories**: `network` · `auth` · `rate_limit` · `llm_error` · `validation` · `server` · `timeout` – each with tailored user message
- **Auto-retry**: API calls retry up to 2× with exponential backoff for transient failures (5xx, 429, network, timeout)
- **120s timeout**: Long-running LLM evaluations don't hang the UI indefinitely
- **Retry UI**: `ErrorAlert` component with inline retry button + dismiss on every error state
- **Transaction errors**: Wallet rejection, insufficient funds, wrong network, nonce conflicts, contract reverts – each with specific guidance
- **Backend health probe**: Connect page checks `GET /health` on mount and warns if backend is unreachable

### Loading & Progress UX

- **Progress bar**: Submit page shows multi-step indicator (Sending → Feasibility → Innovation → Risk → Final verdict)
- **Auto-retry indicator**: Shows attempt count when API layer retries automatically
- **Staggered reveal**: Deliberation page reveals agent cards one-by-one (800ms intervals) with skeleton placeholders
- **Skeleton loading**: Agent cards and history items show skeleton placeholders before data loads
- **Tx stage feedback**: Verdict page shows live stages (Connecting → Verifying network → Preparing → Confirm in MetaMask → Waiting)
- **Character counter**: Submit textarea shows live `count / 4000` with over-limit warning

### Wallet Edge Cases

| Scenario | Behavior |
|----------|----------|
| **No MetaMask** | Detected on mount; shows "Install MetaMask" link instead of broken button |
| **Account change** | `accountsChanged` listener updates address + session instantly |
| **Disconnect** | Detected; clears session, shows reconnect prompt |
| **User rejection** | "Connection request rejected" message with retry |
| **Pending prompt** | "MetaMask is busy" when a prompt is already open |
| **Wrong network** | `NetworkGuard` auto-detects, offers one-click switch to Monad Testnet |
| **Backend down** | Warning banner: "Backend unreachable — evaluation will not work" |

### History: Filtering, Search & Pagination

- **Text search**: Filter by verdict text or submitter address (case-insensitive)
- **Decision filter**: ALL / SHIP / ITERATE / REJECT dropdown
- **Score range**: Min/max numeric inputs for final score
- **Sort**: Newest first · Oldest first · Score high→low · Score low→high
- **Pagination**: 10 items per page with prev/next navigation
- **Live result count**: "X verdicts found (of Y total)" with `aria-live`

### Accessibility (a11y)

- **Skip-to-content link**: Hidden until keyboard-focused; jumps past nav to `#main-content`
- **Semantic HTML**: `<header>`, `<nav>`, `<main>`, `<footer>`, `<article>`, `<time>`, `<details>/<summary>`
- **ARIA**: `role="alert"`, `role="status"`, `role="meter"`, `role="search"`, `aria-label`, `aria-live`, `aria-describedby`
- **Focus rings**: Visible `box-shadow` focus indicators on all interactive elements
- **Screen reader**: `.sr-only` class for hidden labels; `aria-hidden` for decorative icons
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` disables all animations
- **Keyboard**: All flows navigable without mouse
- **Responsive**: Column stacking below 640px

---

## 4) Deployment & DevOps

### Docker

```bash
# Development (backend hot-reload via volume mount)
docker compose --profile dev up

# Staging (1 backend + nginx + frontend)
docker compose --profile staging up -d

# Production (3 backend replicas + nginx load balancer + frontend)
docker compose --profile production up -d
```

| Service | Image | Profile | Port | Notes |
|---------|-------|---------|------|-------|
| `nginx` | `nginx:alpine` | staging, production | 80 | Reverse proxy + L7 load balancer |
| `backend` | Custom (Dockerfile) | all | 4000 | Primary backend instance |
| `backend-2` | Custom (Dockerfile) | production | 4001 | Replica for horizontal scaling |
| `backend-3` | Custom (Dockerfile) | production | 4002 | Replica for horizontal scaling |
| `frontend` | Custom (Dockerfile) | staging, production | 3000 | Next.js production build |
| `backend-dev` | Custom (Dockerfile.dev) | dev | 4000 | Hot-reload with volume mount |

### Nginx Configuration (`infra/nginx.conf`)

- **Load balancing**: `least_conn` across 3 backend instances with `max_fails=3, fail_timeout=30s`
- **Rate limiting**: `10r/s` for API routes, `1r/s` for `/evaluate`
- **Metrics**: `/metrics` restricted to internal IPs only (10.x, 172.16.x, 192.168.x, 127.0.0.1)
- **Security headers**: `X-Request-Id`, `X-Content-Type-Options`, `X-Frame-Options`, `server_tokens off`
- **Logging**: JSON access logs with upstream response time and request ID
- **Proxy timeout**: 120s read timeout for `/evaluate` (LLM calls take time)

### CI/CD (GitHub Actions)

**`ci.yml`** — Runs on push/PR to `main` or `develop`:

| Job | What it does |
|-----|-------------|
| `backend-lint` | `npm run lint` + `npm run format:check` (ESLint + Prettier) |
| `backend-build` | `npm ci` + startup verification (server starts and responds) |
| `backend-docker` | Build Docker image (cached via GHA) |
| `contracts-test` | `hardhat compile` + `hardhat test` |
| `frontend-build` | `npm ci` + `next build` |
| `frontend-docker` | Build Docker image (cached via GHA) |

**`deploy.yml`** — Runs on push to `main` or manual `workflow_dispatch`:

| Job | What it does |
|-----|-------------|
| `determine-env` | Auto-detect target: push to main → staging; manual dispatch → selected |
| `build-and-push` | Build backend + frontend images → push to GitHub Container Registry (GHCR) |
| `deploy` | SSH into target server → `docker compose pull` → `docker compose up -d` |

### Required GitHub Configuration

**Secrets:**

| Secret | Description |
|--------|-------------|
| `DEPLOY_HOST` | Target server IP/hostname |
| `DEPLOY_USER` | SSH username |
| `DEPLOY_SSH_KEY` | SSH private key for deployment |

**Variables (per environment):**

| Variable | Example | Description |
|----------|---------|-------------|
| `BACKEND_URL` | `https://api.example.com` | Public backend URL for frontend build |
| `CONTRACT_ADDRESS` | `0x1234...abcd` | Deployed AgentJury contract address |
| `CHAIN_ID` | `10143` | Target chain ID (Monad Testnet) |
| `RPC_URL` | `https://testnet-rpc.monad.xyz` | RPC endpoint for chain |
| `DEPLOY_PATH` | `/opt/agent-jury` | Path on deploy target (default: `/opt/agent-jury`) |

### Environment Separation

Pre-built configs in `backend/.env.d/`:

| File | NODE_ENV | Auth | PII Redact | Dual Pass | Log Level | Rate Limit |
|------|----------|------|------------|-----------|-----------|------------|
| `development.env` | development | off | off | off | debug | relaxed |
| `staging.env` | staging | on | on | on | info | moderate |
| `production.env` | production | on | on | on | warn | strict |

### Secrets Management

Secrets (`LLM_API_KEY`, `ATTESTATION_PRIVATE_KEY`, `API_KEYS`) must **never** be committed:

| Method | Use Case |
|--------|----------|
| **GitHub Secrets** | CI/CD pipelines (injected at deploy time) |
| **Docker Secrets** | Docker Swarm deployments |
| **Vault / SSM / Secret Manager** | Production (HashiCorp Vault, AWS SSM, GCP) |
| **`.env` files** | Local development (git-ignored by default) |

### Scaling Strategy

| Component | Strategy |
|-----------|----------|
| Backend | Horizontal: stateless replicas behind nginx `least_conn` |
| Database | SQLite per-instance (WAL mode); shared via Docker volume |
| Frontend | Stateless Next.js behind nginx |
| Nginx | L7 load balancer + rate limiting + health checks |

### Graceful Shutdown

Backend handles `SIGTERM`/`SIGINT` for zero-downtime container orchestration:

1. Stop accepting new connections
2. Drain in-flight requests (10s timeout)
3. Close SQLite database connection
4. Exit with code 0

Dockerfiles use `tini` as PID 1 init to correctly forward signals.

---

## Quick Start

### 1. Backend

```bash
cd backend
cp .env.example .env       # Edit with your API keys
npm install
npm run dev                 # Starts on http://localhost:4000
```

### 2. Smart Contract

```bash
cd contracts
cp .env.example .env        # Set MONAD_RPC_URL + DEPLOYER_PRIVATE_KEY
npm install
npm run build               # Compile Solidity
npm test                    # Run tests
npm run test:gas            # Run tests with gas report
npm run deploy:proxy:monad  # Deploy UUPS proxy to Monad Testnet
# or
npm run deploy:monad        # Deploy via Hardhat Ignition
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local  # Set contract address + backend URL
npm install
npm run dev                 # Starts on http://localhost:3000
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LLM_API_KEY` | **Yes** | – | OpenRouter or Gemini API key |
| `LLM_PROVIDER` | No | `openrouter` | `openrouter` or `gemini` |
| `LLM_MODEL` | No | `google/gemini-2.0-flash-001` | Primary model identifier |
| `LLM_MODEL_FALLBACK` | No | `google/gemini-2.0-flash-lite-001` | Fallback model on 429 |
| `LLM_FALLBACK_PROVIDER` | No | – | Cross-provider fallback (`gemini` or `openrouter`) |
| `LLM_FALLBACK_API_KEY` | No | – | API key for fallback provider |
| `LLM_FALLBACK_MODEL` | No | – | Model for fallback provider |
| `PORT` | No | `4000` | Server port |
| `NODE_ENV` | No | `development` | `development` / `staging` / `production` |
| `AI_TEMPERATURE` | No | `0.2` | LLM temperature (lower = more deterministic) |
| `AI_SEED` | No | – | Fixed seed for reproducible outputs |
| `AI_DUAL_PASS` | No | `false` | Run each agent twice for consistency check |
| `SCORE_WEIGHT_FEASIBILITY` | No | `0.45` | Feasibility agent weight (must sum to 1.0) |
| `SCORE_WEIGHT_INNOVATION` | No | `0.35` | Innovation agent weight |
| `SCORE_WEIGHT_RISK` | No | `0.20` | Risk agent weight |
| `SCORE_THRESHOLD_SHIP` | No | `75` | Minimum score for SHIP decision |
| `SCORE_THRESHOLD_ITERATE` | No | `50` | Minimum score for ITERATE decision |
| `SCORE_RISK_INVERSION` | No | `true` | Invert risk score (high risk = lower final score) |
| `SCORE_DISAGREEMENT_DELTA` | No | `30` | Threshold for flagging agent disagreement |
| `ATTESTATION_PRIVATE_KEY` | No | – | ECDSA private key for verdict signing |
| `AUTH_ENABLED` | No | `true` | Enable API key authentication |
| `API_KEYS` | No | – | Comma-separated valid API keys (min 32 chars each) |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX_GLOBAL` | No | `100` | Max requests per window (global) |
| `RATE_LIMIT_MAX_EVALUATE` | No | `5` | Max `/evaluate` requests per window |
| `CORS_ORIGINS` | No | `http://localhost:3000` | Comma-separated allowed origins |
| `DATA_DB_PATH` | No | `./data/agent_jury.db` | SQLite database path |
| `DATA_STORE_CASE_TEXT` | No | `true` | Store raw case text in database |
| `DATA_RETENTION_DAYS` | No | `0` (unlimited) | Auto-purge after N days |
| `DATA_AUTO_REDACT_PII` | No | `false` | Redact PII before LLM |
| `DATA_PURGE_INTERVAL_MS` | No | `3600000` | Purge check interval (ms) |
| `LOG_LEVEL` | No | `debug`/`info` | `trace` · `debug` · `info` · `warn` · `error` · `fatal` |

### Frontend (`frontend/.env.local`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_BACKEND_URL` | **Yes** | `http://localhost:4000` | Backend API URL |
| `NEXT_PUBLIC_AGENT_JURY_CONTRACT` | **Yes** | – | Deployed contract address |
| `NEXT_PUBLIC_MONAD_CHAIN_ID` | No | `10143` | Target chain ID |
| `NEXT_PUBLIC_MONAD_RPC_URL` | No | `https://testnet-rpc.monad.xyz` | Chain RPC URL |
| `NEXT_PUBLIC_API_KEY` | No | – | API key sent as `X-API-Key` header |

### Contracts (`contracts/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `MONAD_RPC_URL` | **Yes** | Monad Testnet RPC endpoint |
| `DEPLOYER_PRIVATE_KEY` | **Yes** | Private key for contract deployment |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Missing LLM_API_KEY` on backend startup | `LLM_API_KEY` not set | Add to `backend/.env`, restart |
| `LLM call failed (401)` | Invalid API key | Check key has no extra spaces, matches provider |
| `LLM call failed (429)` | Rate limited by provider | Fallback model tried automatically; wait or switch provider |
| `Model response is not valid JSON` | LLM returned malformed output | Transient – retry. Verify `LLM_MODEL` is valid |
| `EADDRINUSE :::4000` | Port already in use | `lsof -ti:4000 \| xargs kill -9` or change `PORT` |
| `Failed to connect to localhost:4000` | Backend not running | `cd backend && npm run dev` |
| `MetaMask not found` | Browser has no wallet extension | Install from [metamask.io](https://metamask.io/download/) |
| `Wrong network` in frontend | MetaMask on different chain | Click "Switch to Monad" button or manually switch |
| `Transaction rejected` | User declined MetaMask prompt | Approve the MetaMask transaction prompt |
| `Insufficient funds for gas` | Wallet has no MON | Get testnet MON from Monad faucet |
| `AUTH_ENABLED=true but API_KEYS empty` | Auth enabled without keys | Set `API_KEYS` in `.env` or set `AUTH_ENABLED=false` for dev |
| `Backend unreachable` warning on connect page | Backend server not running | Start backend: `cd backend && npm run dev` |

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | Next.js (App Router) | 14.x |
| **Frontend** | React | 18.x |
| **Frontend** | Ethers.js | 6.x |
| **Backend** | Node.js | 20.x |
| **Backend** | Express.js | 4.x |
| **Backend** | Pino (logging) | 10.x |
| **Backend** | Zod (validation) | 4.x |
| **Backend** | better-sqlite3 | 12.x |
| **Backend** | Helmet | 8.x |
| **Contract** | Solidity | 0.8.24 |
| **Contract** | OpenZeppelin Upgradeable | 5.6.x |
| **Contract** | Hardhat | 2.26.x |
| **DevOps** | Docker + Docker Compose | – |
| **DevOps** | Nginx | Alpine |
| **DevOps** | GitHub Actions | v4 |
| **Chain** | Monad Testnet | Chain ID 10143 |
