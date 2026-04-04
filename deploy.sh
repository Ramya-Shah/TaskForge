#!/bin/bash
set -e

echo "🚀 Deploying TaskForge to Production EC2..."

echo "📥 Pulling latest code from GitHub..."
git pull origin main

echo "📦 Installing Backend Dependencies & Compiling TypeScript..."
cd backend
npm install --production=false
npx tsc
cd ..

echo "📦 Installing & Building Frontend Dashboard..."
cd frontend
npm install
npm run build
cd ..

echo "🌐 Copying Frontend Build to Nginx Web Root..."
sudo mkdir -p /var/www/taskforge/frontend/dist
sudo cp -r frontend/dist/* /var/www/taskforge/frontend/dist/
echo "   ✓ Frontend static files updated — Nginx serving new build immediately!"

echo "🔄 Zero-Downtime Reload via PM2..."
pm2 reload ecosystem.config.js || pm2 start ecosystem.config.js
pm2 save
echo "   ✓ PM2 rolled over to new version with no downtime!"

echo "🌐 Reloading Nginx..."
sudo systemctl reload nginx
echo "   ✓ Nginx reloaded!"

echo ""
echo "✅ Full Deployment Complete! Your live TaskForge is now updated."
echo "   Dashboard: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo 'YOUR-EC2-IP')"
