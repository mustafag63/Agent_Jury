# Agent Jury MVP

Hackathon MVP where 3 AI agents evaluate a startup case and a final judge outputs a weighted decision.  
Verdicts can be saved on-chain with MetaMask (EVM / Monad testnet compatible).

## Project Structure

```
agent_jury/
  backend/      # Express API – multi-agent evaluation pipeline
  contracts/    # Solidity contract + Hardhat deploy config
  frontend/     # Next.js UI – MetaMask + on-chain verdict history
```

## 1) Smart Contract

Path: `contracts/src/AgentJury.sol`

Stores per verdict:
- `caseHash`, `feasibilityScore`, `innovationScore`, `riskScore`, `finalScore`
- `shortVerdict` (max 140 chars enforced on-chain)
- `submitter`, `timestamp`

Functions:
- `saveVerdict(...)` – write a new verdict
- `getVerdict(index)` – read by index
- `getVerdictCount()` – total verdicts stored

## 2) Backend (AI Agent System)

Path: `backend/src/server.js`, `backend/src/agents.js`

### Endpoint

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/evaluate` | `{ "case_text": "..." }` | `{ agent_results, final_verdict, attestation }` |
| `GET` | `/health` | – | `{ ok: true }` |

### LLM Provider Support

Backend supports two providers, controlled via `LLM_PROVIDER` in `.env`:

| Provider | `LLM_PROVIDER` | API Format | Example Models |
|----------|----------------|------------|----------------|
| **OpenRouter** | `openrouter` | OpenAI-compatible (`/v1/chat/completions`) | `google/gemini-2.0-flash-001` |
| **Gemini Direct** | `gemini` | Google Generative Language API | `gemini-2.0-flash` |

- Model outputs are validated with strict JSON schema (`zod`)
- Invalid JSON or schema-non-compliant responses are rejected

### Reliability Guards

- **Sequential agent calls** with inter-call delay to avoid rate limits
- **Fallback model**: if primary model returns 429, automatically falls back to `LLM_MODEL_FALLBACK`
- Exponential backoff with `Retry-After` header support for 429 errors
- `fetch` timeout via `AbortController` (15s)
- Retries for transient failures (`408`, `429`, `5xx`, network errors)

### Final Judge Weighted Logic

| Agent | Weight |
|-------|--------|
| Feasibility | 45% |
| Innovation | 35% |
| Risk | 20% (inverted: `100 - risk`) |

Decision thresholds:
- **SHIP** → `final_score >= 75`
- **ITERATE** → `final_score >= 50`
- **REJECT** → otherwise

## 3) Frontend Pages

Path: `frontend/src/app`

- `/connect` → connect MetaMask wallet
- `/submit` → enter case text, call `/evaluate`
- `/deliberation` → 3 agent cards with thinking animation
- `/verdict` → final score, decision, next steps + save on-chain
- `/history` → read past verdicts from contract

## Quick Start

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Configure `.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LLM_API_KEY` | Yes | – | OpenRouter or Gemini API key |
| `LLM_PROVIDER` | No | `openrouter` | `openrouter` or `gemini` |
| `LLM_MODEL` | No | `google/gemini-2.0-flash-001` | Primary model |
| `LLM_MODEL_FALLBACK` | No | `google/gemini-2.0-flash-lite-001` | Fallback on 429 |
| `PORT` | No | `4000` | Server port |
| `ATTESTATION_PRIVATE_KEY` | No | – | Private key for verdict attestation signing |

### Contracts (Deploy)

```bash
cd contracts
cp .env.example .env
# Set MONAD_RPC_URL and DEPLOYER_PRIVATE_KEY in .env
npm install
npm run build
npm run deploy:monad
# Copy deployed contract address
```

### Frontend

```bash
cd frontend
cp .env.example .env.local
# Set NEXT_PUBLIC_BACKEND_URL and NEXT_PUBLIC_AGENT_JURY_CONTRACT
npm install
npm run dev
# Open http://localhost:3000
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Missing LLM_API_KEY on backend` | Add `LLM_API_KEY` to `backend/.env`, restart |
| `LLM call failed (401)` | Check API key – no extra spaces, correct provider |
| `LLM call failed (429)` | Rate limited – fallback model will be tried automatically. If persistent, wait or switch provider |
| `Model response is not valid JSON` | Transient model instability – retry. Check `LLM_MODEL` is valid |
| `EADDRINUSE :::4000` | Kill existing process: `lsof -ti:4000 \| xargs kill -9` or change `PORT` |
| `Failed to connect to localhost:4000` | Backend not running – `cd backend && npm run dev` |

## Hackathon Notes

- Intentionally simple for live demos – no auth, no tokenomics.
- Core focus: clear agent-based decision flow + on-chain proof of verdict.
- Supports provider switching (OpenRouter ↔ Gemini) via single env variable.
