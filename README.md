# TaskForge: Distributed Task Queue Engine 🚀

TaskForge is a high-performance, decentralized background task processing engine built to reliably offload heavy application workloads. 

When a user triggers an intensive action on your main app (e.g., resizing avatars, sending emails, processing payments), you can't afford to let their HTTP request hang. **TaskForge** solves this by accepting jobs instantly, persistently tracking their state, and distributing them to a pool of background worker nodes while reporting real-time metrics back to a beautiful React Observer Dashboard.

## Core Features
*   🏎️ **Blazing Fast Queuing**: Relies on **Redis** `BLPOP` blocking lists to reliably dequeue jobs in microseconds without heavy database polling.
*   💾 **Permanent State Logging**: All lifecycle events (timestamps, worker assignments, attempt counts) are strictly recorded to **PostgreSQL** to survive crashes.
*   ⏳ **Exponential Backoff**: When a task naturally fails (network error, API limit), the engine delays it exponentially ($2^{attempts}$ seconds) using Redis Sorted Sets before safely retrying.
*   💀 **Dead Letter Queue (DLQ)**: Tasks that fail `5` consecutive times are permanently isolated in a dead letter queue preventing eternal blocking loops.
*   📊 **Real-Time Observer**: A live React dashboard tracking job throughput, failure analytics, and active worker node health via **WebSocket (Socket.io)**.

## The Architecture Stack
* **Backend Producer API**: Node.js, Express, TypeScript, `socket.io`, `ioredis`, `pg`.
* **Worker Engine**: Node.js Worker processes completely independent from the main API.
* **Observer UI**: React 18, Vite, **Tailwind CSS v4**, Lucide Icons.
* **Infrastructure**: Docker Compose (PostgreSQL 15, Redis 7).

---

## Getting Started (Local Development)

### 1. Boot up the Infrastructure
Ensure Docker is running, then spin up the Redis queue and PostgreSQL database:
```bash
docker-compose up -d
```

### 2. Start the Master API Server
Open a terminal in the `backend/` directory, install dependencies, and start the publisher API:
```bash
cd backend
npm install
npx ts-node src/server.ts
```
*(Runs on `http://localhost:3001`)*

### 3. Spin Up the Worker Nodes
Open several new terminal tabs in the `backend/` folder and boot up 2-3 parallel worker processes. They will immediately begin polling the queue:
```bash
cd backend
npx ts-node src/worker/worker.ts
```

### 4. Launch the Observer Dashboard
Open a new terminal, install the frontend UI, and start the Vite dev server:
```bash
cd frontend
npm install
npm run dev
```
👉 Open your browser to **http://localhost:5173** to monitor the cluster.

---

## 💣 Running a Load Test
To see the Engine truly dynamically balance work and handle failure logic, run the built-in stress tester. It blasts 50 dynamic mock tasks to the API Server at high speed!

```bash
cd backend
node test_blast.js
```
*Switch immediately to your Dashboard tab to watch the workers tear down the pending queue, trigger automated retries, and isolate DLQ events!*
