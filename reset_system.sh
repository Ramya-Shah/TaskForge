#!/bin/bash
set -e

echo "⚠️  WARNING: This will permanently ERASE all job history and reset the entire system."
read -p "Are you sure you want to proceed? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "Reset cancelled."
    exit 1
fi

echo "🛑 Stopping and deleting all PM2 processes..."
pm2 delete all || true

echo "🧹 Clearing Redis (Queues, State, Paused flags)..."
docker exec -t taskforge-redis redis-cli FLUSHALL
echo "   ✓ Redis flushed!"

echo "🐘 Clearing PostgreSQL (Job Records)..."
docker exec -t taskforge-postgres psql -U taskforge -d taskforge -c "TRUNCATE TABLE jobs RESTART IDENTITY;"
echo "   ✓ PostgreSQL jobs table truncated!"

echo "🏗️ Performing a clean build and deployment..."
./deploy.sh

echo ""
echo "✅ SYSTEM RESET COMPLETE!"
echo "   Everything is now fresh and running with Worker 1-6."
