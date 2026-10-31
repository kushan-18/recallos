# 🧠 RecallOS

> An agentic memory layer for AI apps — built for the **MongoDB Agentic Memory** hackathon track.

**Status: foundation only.** This repo currently contains a working full‑stack skeleton (React frontend + Node/Express backend) with a health‑check API. The AI and memory engine will be built on top of this.

---

## Tech stack

| Layer    | Tools                                                                 |
| -------- | --------------------------------------------------------------------- |
| Frontend | React 19, Vite, Tailwind CSS v4                                       |
| Backend  | Node.js, Express 5, CORS, dotenv                                      |
| Language | JavaScript (no TypeScript — beginner‑friendly)                        |
| Database | MongoDB Atlas _(not connected yet — comes with the memory engine)_    |

---

## Project structure

```
recallos/
├── README.md                  ← you are here
├── package.json               ← root scripts (install both, run both)
│
├── backend/                   ← Node.js + Express API
│   ├── .env.example           ← copy to .env for your settings
│   └── src/
│       ├── server.js          ← entry point: starts the HTTP server
│       ├── app.js             ← builds the Express app (routes, middleware)
│       ├── config/
│       │   └── env.js         ← loads all environment variables in one place
│       ├── routes/
│       │   ├── index.js       ← mounts every feature route under /api
│       │   └── health.routes.js
│       ├── controllers/
│       │   └── health.controller.js  ← the actual health-check logic
│       ├── middleware/
│       │   └── errorHandler.js       ← 404 + error responses as clean JSON
│       └── utils/
│           └── logger.js              ← timestamped console logging
│
└── frontend/                  ← React + Vite app
    ├── .env.example           ← copy to .env for your settings
    ├── index.html             ← the single HTML page Vite serves
    ├── vite.config.js         ← dev server + /api proxy to the backend
    └── src/
        ├── main.jsx           ← entry point: renders <App /> into the page
        ├── App.jsx            ← top-level layout (header + page)
        ├── index.css          ← Tailwind import (all styling utilities)
        ├── api/
        │   └── client.js      ← ALL backend fetch calls live here
        ├── components/
        │   ├── layout/
        │   │   └── Header.jsx
        │   └── StatusCard.jsx
        └── pages/
            └── HomePage.jsx   ← shows the backend health status
```

**Rule of thumb:** a *page* is a full screen (`pages/`), a *component* is a reusable piece of UI (`components/`), and every network call goes through `api/client.js`.

---

## Prerequisites

- **Node.js ≥ 20** (includes `npm`). Check with `node --version`.

---

## Getting started

Open a terminal in the `recallos/` folder.

### 1. Install dependencies (both apps)

```bash
npm run install:all
```

This runs `npm install` inside both `backend/` and `frontend/`, which downloads the libraries each app needs into `node_modules/`.

### 2. Create your environment files

Environment variables are settings that live **outside** your code, so secrets never end up in Git.

```bash
# Backend
copy backend\.env.example backend\.env      # macOS/Linux: cp backend/.env.example backend/.env

# Frontend
copy frontend\.env.example frontend\.env    # macOS/Linux: cp frontend/.env.example frontend/.env
```

The defaults work as‑is for local development. When we add MongoDB later, your `MONGODB_URI` goes into `backend/.env` — **never** into source code.

### 3. Run it

**Option A — one command (both apps together):**

```bash
npm run dev
```

**Option B — two terminals (easier to read the logs):**

```bash
# Terminal 1
cd backend
npm run dev          # backend on http://localhost:5000

# Terminal 2
cd frontend
npm run dev          # frontend on http://localhost:5173
```

### 4. Verify

- Backend health check (browser or `curl http://localhost:5000/api/health`):

  ```json
  {
    "status": "ok",
    "service": "recallos-backend",
    "message": "RecallOS backend is up and running",
    "environment": "development",
    "timestamp": "2026-…Z",
    "uptimeSeconds": 3
  }
  ```

- Frontend: open **http://localhost:5173** — the "Backend API" card should turn **green (Connected)** and show the same data. Press **↻ Re-check** to ping again. If it's red, make sure the backend is running.

---

## Available scripts

| Where      | Command         | What it does                                             |
| ---------- | --------------- | -------------------------------------------------------- |
| `recallos/`  | `npm run install:all` | Installs dependencies for backend **and** frontend |
| `recallos/`  | `npm run dev`         | Runs both apps at once (via `concurrently`)         |
| `backend/`   | `npm run dev`         | Starts the API with auto‑restart on file changes (`nodemon`) |
| `backend/`   | `npm start`           | Starts the API with plain `node` (no auto‑restart)  |
| `frontend/`  | `npm run dev`         | Starts the Vite dev server (hot reload)               |
| `frontend/`  | `npm run build`       | Builds the frontend for production into `frontend/dist/` |
| `frontend/`  | `npm run preview`     | Serves that production build locally to test it       |

---

## How the two apps talk

```
Browser ──▶ Vite dev server (5173)
                │  /api/* requests are forwarded (proxy in vite.config.js)
                ▼
           Express API (5000)
```

The proxy means the frontend can call `/api/health` with a **relative** URL — no hardcoded `http://localhost:5000` in the React code. In production you'd point `VITE_API_BASE_URL` at your deployed backend URL instead.

---

## Environment variables

| File                    | Variable             | Default                  | Purpose                                  |
| ----------------------- | -------------------- | ------------------------ | ---------------------------------------- |
| `backend/.env`          | `PORT`               | `5000`                   | Port the API listens on                  |
| `backend/.env`          | `NODE_ENV`           | `development`            | Environment name                         |
| `backend/.env`          | `CORS_ORIGIN`        | `http://localhost:5173`  | Which origin may call the API            |
| `backend/.env`          | `MONGODB_URI`        | _(empty, future)_        | MongoDB connection string (later)        |
| `frontend/.env`         | `VITE_API_BASE_URL`  | `/api`                   | Base URL for API calls                   |

---

## What's next (not built yet)

1. **MongoDB Atlas connection** — store memories in the database
2. **Memory engine** — save, retrieve, and reason over agent memories
3. **AI integration** — the agent that uses those memories

---

## License

MIT
