# AI Customer Support — Agentic Memory Demo

> **Temporary name** — the team hasn't picked the final product name yet.
> Built for the **MongoDB Agentic Memory** hackathon track.

An AI customer support chatbot for a simulated ISP ("FastNet") that **remembers each customer across separate conversations**. A customer chats with the AI today, corrects a detail, comes back next week in a brand-new chat — and the AI already knows: their router model, their night-shift schedule, their open tickets. An employee dashboard lets the support team see everything the AI remembers, summarize any conversation, take over a chat in person, and move tickets from open to resolved.

---

## What's inside

| Side | What you get |
| ------ | ------------ |
| **Customer** (`/`, `/chat/:cid`, `/memories/:cid`, `/tickets/:cid`) | Demo customer picker → AI chat with conversation history → a transparency page where you view/edit/delete every memory the AI holds → open/resolved tickets |
| **Employee** (`/employee/*`) | Overview counts → customer list → customer profile (memories, tickets with status dropdowns, conversation history) → conversation view with **AI summary**, **human takeover**, and human replies |
| **Memory engine** (backend) | Vector retrieval per customer, one-call reply+extraction pipeline, embeddings stored in MongoDB Atlas, Atlas Vector Search first with a genuine cosine fallback |

---

## Architecture

```
recallos/
├── README.md               ← you are here
├── package.json            ← root scripts: install:all, dev (both apps)
│
├── backend/                ← Express 5 + Mongoose (plain JavaScript)
│   ├── .env.example        ← copy to .env and fill in YOUR values (never commit .env)
│   └── src/
│       ├── server.js, app.js
│       ├── config/         env.js (all settings), db.js (Atlas connection)
│       ├── routes/         index.js mounts: /health /chat /customers
│       │                   /conversations /memories /tickets  and  /employee/*
│       ├── controllers/    chat, customer, conversation, memory, ticket,
│       │                   employee, health
│       ├── services/
│       │   ├── gemini.js        raw Gemini REST calls + 429 backup-key failover
│       │   ├── memoryService.js vector retrieval + memory save/update
│       │   └── knowledgeService.js  company FAQ vector search
│       ├── models/         Customer, Conversation, Message, Memory, Ticket, Knowledge
│       ├── data/           seed, embed, verify + test scripts (see below)
│       └── middleware/     clean JSON 404/error responses
│
└── frontend/               ← React 19 + Vite + Tailwind v4 + react-router
    └── src/
        ├── api/client.js   ← every fetch call (with timeouts), no keys ever
        ├── pages/          customer picker, chat, memories, tickets
        │   └── employee/   overview, customers, profile, conversation
        └── components/     Header, CustomerNav, EmployeeNav, …
```

```
Browser ─▶ Vite dev server :5173 ── /api/* proxy ─▶ Express :5000
                                                   │
                     ┌─────────────────────────────┼──────────────────────────┐
                     ▼                             ▼                          ▼
              MongoDB Atlas                 Gemini API (REST)          Gemini API (REST)
              memories + vectors            generate (chat)            embed (vectors)
              knowledge_vector_index        generate (summaries)       3072-dim, same keys
              memory_vector_index           [primary key → backup key on 429]
```

- **No SDKs** — Gemini is called with plain `fetch` against its REST endpoints (45s timeout, friendly error messages).
- **No hardcoded keys** — everything secret lives in `backend/.env` (git-ignored). `GET /api/health` reports `aiConfigured` / `aiBackupConfigured` as booleans only; logs name key *slots* (`primary` / `backup`), never values.

---

## The memory workflow (what happens to one message)

1. **VALIDATE** — customer and conversation must belong together (isolation, see below). Rejections happen **before** any AI call.
2. **RETRIEVE** — in one round trip:
   - this customer's top-5 memories by vector similarity (filtered by `customerId`),
   - top-3 company knowledge articles (policies, FAQs),
   - their open tickets, and the last 10 messages of this conversation.
3. **ANSWER + LEARN in ONE Gemini call** (Phase 5 merge) — a substantive message gets a single JSON call returning `{"reply": ..., "memories": [...]}`: the customer-facing reply *and* up to 2 durable memories (create or correct-existing). Greetings/thanks are detected as trivial and skip extraction — still exactly **1 generation call** either way. Failover (primary → backup on quota errors) applies inside the service layer.
4. **SAVE** — new/updated memories are deduplicated, embedded (3072-dim) and written to MongoDB with their `sourceConversationId` for auditing. If saving fails, the reply still ships (reported honestly).
5. **REPORT** — the response carries `retrieval.mode`, exactly which memories were used with scores, and what was saved — the chat UI strips this under every answer, so the memory engine is *visible*, not implied.

**The payoff:** message #1 of any *future* conversation starts at step 2, so the AI recalls durable facts from earlier chats without being told them. Corrections made mid-chat (e.g. "it's an XR-300, not XR-200") update the stored memory in place, so the wrong fact never survives.

---

## Which retrieval method is actually used

**Atlas Vector Search — genuinely, first, every time.**

- Index: `memory_vector_index` on the `memories` collection (`path: embedding`, 3072 dims, cosine) — with `customerId` as a `$vectorSearch` **filter**, so similarity search itself is scoped per customer.
- Knowledge uses the sibling `knowledge_vector_index`.
- **Fallback is real, not decorative:** if the index is missing or the aggregate fails, the code downgrades to cosine similarity computed in Node over the same embeddings (`cosine-fallback`) and says so.
- **Honesty, three ways:**
  1. `GET /api/health` → `retrieval` field reflects the live mode (determined by a free zero-vector `$vectorSearch` probe — no AI quota spent);
  2. every chat response repeats the mode used;
  3. `npm run test:search` runs real semantic queries (different words, right memory), prints scores, and verifies zero cross-customer leaks.

This project does **not** fake retrieval. If Atlas Vector Search were unavailable, the mode would read `cosine-fallback` and the README would say so.

---

## Data isolation approach

The demo has **no login**, so isolation is enforced server-side around a single rule: *every customer-specific request carries a `customerId`, and the backend never trusts the client.*

- **URL-scoped** — `customerId` lives in the URL of every customer page (`/chat/6ae5…ed3`); every API call from those pages carries it.
- **Query-filtered** — every find on conversations, messages, memories and tickets filters on `customerId`. Vector search adds the same filter inside `$vectorSearch`.
- **Ownership-checked, existence-hiding** — reading/editing/deleting requires `_id AND customerId` to match; a foreign id always returns **404** (we don't even confirm the id exists elsewhere). Replies and ticket mutations work the same way.
- **Take-over guard** — `POST /api/chat` answers **409** while a conversation is in human mode, before any AI call.
- **Employee routes are separate by design** — everything lives under `/api/employee/*` (frontend `/employee/*`), in its own controller/routes file. Employees are privileged and legitimately see all customers; in a real product these routes would sit behind an authenticated employee session (see limitations).
- **Tested, not assumed** — `npm run test:endpoints` (31 checks) and `npm run test:employee` (38 checks) race both identities against real and throwaway records: cross-customer reads, edits, deletes, unknown-customer sweeps — all expect 404/400 or empty results, **zero AI calls**.

---

## Honest limitations

- **The demo customer picker is not authentication.** Picking "Alice Johnson" *is* the login. Anyone with the URL can act as any demo customer — that's why every backend query still enforces ownership. Real deployments need real auth on both sides.
- **The employee dashboard has no login either** (documented above). `/api/employee/*` is intentionally unrestricted for the demo.
- **All data is simulated ISP data** — "FastNet", Alice Johnson, Bob Smith, their tickets and knowledge articles are invented demo records (seeded, labelled `isDemo: true` / `[DEMO]` titles). No real people or real customers.
- **Gemini free-tier quota is the main constraint** — ~20 generation calls/day, and both configured keys currently share **one Google Cloud project**, so the backup key absorbs *transient* errors but not the shared daily cap (it fully helps only when issued from a second project). Budgeting: 1 call per chat message (merged pipeline), 1 per employee "Generate summary" click (cached afterwards — browsing never re-spends it), 0 for greetings' extraction. `npm run demo:reset` + `test:search` use embedding quota, which is separate.
- **No production hardening** — no rate limiting, no request auth, no monitoring; CORS is dev-open. Fine for a 12-hour MVP demo, not for the internet.
- **Temporary product name** — "AI Customer Support" until the team decides.

---

## Setup

**Prerequisites:** Node.js ≥ 20, a MongoDB Atlas cluster, and a Gemini API key (free at <https://aistudio.google.com/apikey>).

```bash
# 1. Install everything (root folder)
cd recallos
npm run install:all

# 2. Create your environment files FROM THE EXAMPLES (never from anyone's .env)
copy backend\.env.example  backend\.env        # macOS/Linux: cp backend/.env.example backend/.env
copy frontend\.env.example frontend\.env

# 3. Edit backend\.env and put YOUR values in:
#      MONGODB_URI             your Atlas connection string
#      GEMINI_API_KEY          your key
#      GEMINI_API_KEY_BACKUP   optional second key (429 failover)
#    Model settings already match the deployed Atlas indexes:
#      GEMINI_MODEL=gemini-3.5-flash
#      GEMINI_EMBEDDING_MODEL=gemini-embedding-001
#      EMBEDDING_DIM=3072
#    .env is git-ignored — Git will never commit it.

# 4. Seed the labelled demo data + build its vectors
cd backend
npm run seed            # FastNet customers, chats, tickets, memories, knowledge
npm run embed           # embed memories + knowledge (3072-dim)
npm run test:search     # proves Atlas Vector Search is live + isolation clean
npm run verify          # sanity-checks the seeded database

# 5. Run both apps
cd ..
npm run dev             # backend :5000 + frontend :5173 (one command)

# 6. Open http://localhost:5173
#    → pick a demo customer → chat → watch the retrieval strip under each reply
#    → 🛠️ Employee in the header for the dashboard
```

Starting over for a demo? `npm run demo:reset` (in `backend/`) wipes the demo customers' conversations/memories/tickets and re-seeds them clean, then re-embeds everything.

---

## Scripts

| Where | Command | What it does |
| ------ | ------- | ------------ |
| `recallos/` | `npm run install:all` | Installs backend + frontend dependencies |
| `recallos/` | `npm run dev` | Runs both apps together (`concurrently`) |
| `backend/` | `npm run dev` | API with auto-restart (`nodemon`, :5000) |
| `backend/` | `npm run seed` | Creates/refreshes the labelled demo data (idempotent) |
| `backend/` | `npm run embed` | Backfills embeddings for unembedded memories/knowledge |
| `backend/` | `npm run demo:reset` | **Demo reset:** seed + embed → clean starting state |
| `backend/` | `npm run test:search` | Real semantic queries → proves `atlas-vector` + isolation |
| `backend/` | `npm run test:endpoints` | **31 checks**, customer API isolation, **0 AI calls** |
| `backend/` | `npm run test:employee` | **38 checks**, employee API + takeover/ticket flows, **0 AI calls** |
| `backend/` | `npm run test:chat` | Memory across conversations, corrections, isolation (uses AI) |
| `backend/` | `npm run test:failover` | Proves 429 → backup-key retry behavior (logs slots only) |
| `backend/` | `npm run verify` | Quick database sanity check |
| `frontend/` | `npm run build` | Production build to `frontend/dist/` |

---

## Deployment

### Backend → Render (root directory: `backend`)

1. Create a new **Web Service** on [Render](https://render.com) connected to this repo.
2. Set **Root Directory** to `backend`.
3. Build command: `npm install` — Start command: `npm start` (already in `package.json`, runs `node src/server.js`).
4. Add environment variables in the Render dashboard (never in code):
   - `NODE_ENV=production`
   - `MONGODB_URI` — your Atlas connection string
   - `GEMINI_API_KEY` — your key (and `GEMINI_API_KEY_BACKUP` if you have a second)
   - `CORS_ORIGIN` — comma-separated list, e.g. `http://localhost:5173,https://your-site.netlify.app`
   - Model settings (`GEMINI_MODEL`, `GEMINI_EMBEDDING_MODEL`, `EMBEDDING_DIM`) if different from defaults
5. Render assigns a `PORT` automatically — the server reads it from the environment.

### Frontend → Netlify (base directory: `frontend`)

1. Create a new site on [Netlify](https://netlify.com) connected to this repo.
2. Set **Base directory** to `recallos/frontend`.
3. Build settings (also in `frontend/netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Add environment variable in the Netlify dashboard:
   - `VITE_API_BASE_URL` = `https://your-app.onrender.com/api` (your Render backend URL + `/api`)
   - ⚠️ This is baked in at build time — change it and redeploy if the backend URL changes.
5. SPA routing is handled by `frontend/public/_redirects` (copied to `dist/` on build) and `netlify.toml` — all routes fall back to `index.html`.

### Post-deploy check

Visit `https://your-app.onrender.com/api/health` — you should see `status: ok`, `database: connected`, and `retrieval: atlas-vector`.

---

## Security notes (keys & data)

- `.env.example` files contain **placeholders only** — real values belong in `.env`, which is listed in `.gitignore` (`recallos/.gitignore` and `backend/.gitignore`).
- No API key, connection string or password appears anywhere in this repository: tracked files are scanned for Google-key patterns, credential-bearing Mongo URIs and assigned key values.
- The health endpoint reports **booleans only** (`aiConfigured`, `aiBackupConfigured`); logs identify keys as `primary`/`backup` slots.

## License

MIT
