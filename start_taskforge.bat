@echo off
echo ==============================================
echo 🚀     STARTING TASKFORGE ENGINE       🚀
echo ==============================================

echo [1/4] Booting Core Infrastructure (Redis % Postgres)...
docker-compose up -d
timeout /t 3 /nobreak >nul

echo [2/4] Starting Master API Server (Port 3001)...
start "TaskForge API Server" cmd /k "cd backend && npx ts-node src/server.ts"
timeout /t 3 /nobreak >nul

echo [3/4] Spawning 3 Parallel Worker Nodes...
start "TaskForge Worker Node 1" cmd /k "cd backend && npx ts-node src/worker/worker.ts"
start "TaskForge Worker Node 2" cmd /k "cd backend && npx ts-node src/worker/worker.ts"
start "TaskForge Worker Node 3" cmd /k "cd backend && npx ts-node src/worker/worker.ts"

echo [4/4] Launching React Observer Dashboard...
start "TaskForge Dashboard" cmd /k "cd frontend && npm run dev"

echo.
echo ✅ ALL SYSTEMS ONLINE!
echo 🌐 The Dashboard is running at: http://localhost:5173
echo.
echo 🔥 Want to test the queue load? Open a terminal and run:
echo    cd backend ^&^& node test_blast.js
echo.
pause
