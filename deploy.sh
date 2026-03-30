#!/bin/bash
set -e

echo "🚀 Deploying TaskForge to Production EC2 Phase..."

echo "📥 Pulling latest code from GitHub..."
git pull origin main

echo "📦 Installing Backend Dependencies & Compiling TypeScript..."
cd backend
npm install --production=false
# Compile typescript down to native JS for performance
npx tsc 
cd ..

echo "📦 Installing & Building Frontend Dashboard for Nginx..."
cd frontend
npm install
npm run build
cd ..

echo "🔄 Restarting Node Services via PM2..."
# If not installed initially, do: npm install -g pm2
pm2 reload ecosystem.config.js || pm2 start ecosystem.config.js
pm2 save

echo "🌐 Restarting Nginx Server..."
# Remember to move your nginx.conf to /etc/nginx/sites-available/ and symlink it first!
sudo systemctl restart nginx

echo "✅ Deployment Automation Successful!"
