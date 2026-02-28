# Agent Jury MVP

Hackathon MVP where 3 AI agents evaluate a case and a final judge outputs a decision.  
Verdicts can be saved on-chain with MetaMask (EVM / Monad testnet compatible).

## Project Structure

```
agent_jury/
  backend/      # Express API with multi-agent evaluation pipeline
  contracts/    # Solidity contract + Hardhat deploy config
  frontend/     # Next.js UI with MetaMask + on-chain history
```

## 1) Smart Contract

Path: `contracts/src/AgentJury.sol`

Stores:
- `caseHash`
- `feasibilityScore`
- `innovationScore`
- `riskScore`
- `finalScore`
- `shortVerdict` (max 140 chars enforced)
- `submitter`
- `timestamp`

Functions:
- `saveVerdict(...)`
- `getVerdict(index)`
- `getVerdictCount()`

## 2) Backend (AI Agent System)

Path: `backend/src/server.js`, `backend/src/agents.js`

### Endpoint
- `POST /evaluate`
- Input: `{ "case_text": "..." }`
- Output:
  - `agent_results` (Feasibility, Innovation, Risk & Ethics)
  - `final_verdict` (weighted final judge output)
- Port: `PORT` (default `4000`)

### LLM Provider
- Provider: **Gemini only**
- Endpoint: Google Generative Language API (`generateContent`)
- Backend validates model outputs with strict JSON schema (`zod`)
- If model output is not valid JSON/schema-compliant, request is rejected

### Reliability Guards
- `fetch` timeout via `AbortController`
- Limited retry with exponential backoff for transient failures (`408`, `429`, `5xx`, network/abort errors)

### Final Judge Weighted Logic
- Feasibility: `45%`
- Innovation: `35%`
- Risk: `20%` as inverse (`100 - risk`) so higher risk lowers final score

Decision thresholds:
- `SHIP` if `final_score >= 75`
- `ITERATE` if `final_score >= 50`
- `REJECT` otherwise

## 3) Frontend Pages

Path: `frontend/src/app`

- `/connect` → connect MetaMask
- `/submit` → enter case text and call `/evaluate`
- `/deliberation` → show 3 agent cards + thinking animation
- `/verdict` → show final score/decision/next steps + save on-chain
- `/history` → read verdict records from contract

## Quick Start

### Backend
1. `cd backend`
2. `cp .env.example .env`
3. Set:
   - `LLM_API_KEY` (required, Gemini key)
   - `LLM_MODEL` (default: `gemini-2.5-flash`)
   - `PORT` (optional, default: `4000`)
4. `npm install`
5. `npm run dev`

### Contracts (Deploy)
1. `cd contracts`
2. `cp .env.example .env`
3. Set `MONAD_RPC_URL` and `DEPLOYER_PRIVATE_KEY`
4. `npm install`
5. `npm run build`
6. `npm run deploy:monad`
7. Copy deployed contract address

### Frontend
1. `cd frontend`
2. `cp .env.example .env.local`
3. Set:
   - `NEXT_PUBLIC_BACKEND_URL`
   - `NEXT_PUBLIC_AGENT_JURY_CONTRACT`
4. `npm install`
5. `npm run dev`
6. Open `http://localhost:3000`

## Hackathon Notes

- This MVP is intentionally simple for live demos.
- No auth, no tokenomics, no extra features.
- Core focus is clear agent-based decision flow + on-chain proof of verdict.
