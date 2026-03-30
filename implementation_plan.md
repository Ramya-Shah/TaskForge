# TaskForge - Distributed Task Queue Engine

TaskForge is a custom distributed task queue engine that leverages Redis for high-throughput queuing and PostgreSQL for persistent job state tracking. It includes a backend API for producers, a scalable worker pool, a robust retry engine with exponential backoff, and a real-time React dashboard.

## User Review Required

> [!IMPORTANT]
> Since this is a very substantial full-stack project, please review the technology stack and architecture outlined below. I recommend using **Node.js with TypeScript** for the backend (both the API and Worker pool) and **Vite + React** with **Tailwind CSS v4** for the frontend dashboard. I will also use **Docker Compose** to spin up Redis and PostgreSQL locally. Does this tech stack sound good to you?

> [!CAUTION]
> As requested, we will be using **Tailwind CSS v4** to build a modern, high-quality dashboard instead of vanilla CSS.

## Proposed Changes

### 1. Infrastructure (Docker)
- Create a `docker-compose.yml` to run:
  - PostgreSQL (for permanent job history, stats, and DLQ)
  - Redis (for real-time fast queues: incoming jobs, delayed jobs, active jobs)

### 2. Backend API (Producer & Core Engine)
**Tech**: Node.js, Express, TypeScript, `ioredis`, `pg` (or Prisma)

- `POST /jobs`: Endpoint to accept new jobs (type, payload). Inserts into Postgres (status: pending) and pushes to Redis queue.
- WebSocket Server (`socket.io`): Emits real-time updates about worker health, job throughput, and failure rates to the frontend.

#### [NEW] `backend/src/server.ts`
#### [NEW] `backend/src/queue/producer.ts`
#### [NEW] `backend/src/db/index.ts`

### 3. Worker Pool & Retry Engine
**Tech**: Node.js worker threads or independent Node processes.

- **Workers**: Use Redis `BLPOP` to reliably dequeue jobs. Update Postgres status to 'processing'.
- **Execution**: Run the job logic. On success, update Postgres to 'completed'.
- **Retry Engine**: On failure, increment attempt count. If attempts < 5, calculate backoff delay ($2^{attempts}$ seconds) and move to a "delayed" Redis Sorted Set. If attempts >= 5, move to Dead Letter Queue (DLQ) in Postgres.
- A "poller" process will scan the delayed set and move mature jobs back to the regular queue.

#### [NEW] `backend/src/worker/worker.ts`
#### [NEW] `backend/src/worker/retryEngine.ts`

### 4. React Dashboard
**Tech**: Vite, React, WebSockets, TailwindCSS

- Real-time display of job throughput (jobs per second).
- Live worker health monitoring (which workers are active/idle).
- Analytics for success vs failure rates.
- Premium UI with vibrant colors, dark mode, smooth gradients, and micro-animations via Tailwind.

#### [NEW] `frontend/index.html`
#### [NEW] `frontend/src/App.tsx`
#### [NEW] `frontend/src/components/Dashboard.tsx`
#### [NEW] `frontend/src/index.css`

## Open Questions

> [!WARNING]
> 1. Should we mock some sample "job types" (e.g., `send_email`, `resize_image`) in the worker to demonstrate successful and failed jobs on the dashboard?
> 2. Are you comfortable with using Docker to run Redis and Postgres for this setup?

## Verification Plan

### Automated/Manual Testing
- Bring up `docker-compose up -d`.
- Start the Backend API and 3 Worker processes.
- Start the React Frontend.
- Write a simple test script (or use cURL) to blast 100+ simulated jobs to the Producer.
- Visually verify on the dashboard that jobs are being processed, throughput spikes, and failed jobs retry/DLQ correctly.
