# TaskForge — Complete EC2 Production Deployment Guide

> [!IMPORTANT]
> This guide deploys TaskForge on a **Free-Tier eligible** AWS EC2 Ubuntu instance.
> Budget: **$0/month** using the AWS Free Tier (750 hrs/month of t2.micro included).

---

## PHASE 1 — Provision Your EC2 Instance on AWS

### Step 1: Create an AWS Account
Go to [https://aws.amazon.com](https://aws.amazon.com) and click **Create an AWS Account**. A credit card is required for verification but **you won't be charged** on the free tier.

### Step 2: Launch an EC2 Instance
1. In the AWS Console, search for **EC2** → click **Launch Instance**.
2. **Name:** `taskforge-server`
3. **AMI (Operating System):** Select `Ubuntu Server 22.04 LTS (HVM), SSD Volume Type` — make sure it says **Free tier eligible**.
4. **Instance Type:** Select `t2.micro` (Free tier eligible — 1 vCPU, 1GB RAM).
5. **Key Pair (for SSH login):**
   - Click **Create new key pair**.
   - Name it `taskforge-key`.
   - Type: `RSA`, Format: `.pem` (works in Git Bash on Windows).
   - **Download the `.pem` file immediately. Save it to `C:\Users\imram\.ssh\taskforge-key.pem`. You cannot download it again!**
6. **Network Settings → Firewall (Security Group):**
   - Click **Edit** and add these inbound rules:

   | Type | Protocol | Port | Source |
   |------|----------|------|--------|
   | SSH | TCP | 22 | My IP *(only you can SSH in)* |
   | HTTP | TCP | 80 | Anywhere (0.0.0.0/0) |
   | Custom TCP | TCP | 3001 | Anywhere (0.0.0.0/0) |

7. **Storage:** Keep default (8 GB SSD).
8. Click **Launch Instance** → wait 60 seconds until it says **Running**.
9. Click your instance → copy the **Public IPv4 address** (e.g., `54.91.123.45`). **Save this — it is your server's address for everything!**

---

## PHASE 2 — SSH Into Your Server from Windows

### Step 1: Fix Key Permissions
Open **Git Bash** and run:
```bash
chmod 400 ~/.ssh/taskforge-key.pem
```

### Step 2: Connect to the Server
```bash
ssh -i ~/.ssh/taskforge-key.pem ubuntu@54.91.123.45
```
Replace `54.91.123.45` with your actual EC2 Public IP. When asked `Are you sure you want to continue connecting?` → type `yes`.

> [!NOTE]
> You are now **inside your Ubuntu server** running in Amazon's data center. Every command from this point runs remotely on EC2.

---

## PHASE 3 — Install All Dependencies on the Server

Run these commands in order. Only needed **once** on a fresh server.

### Step 1: Update the OS
```bash
sudo apt update && sudo apt upgrade -y
```

### Step 2: Install Node.js 20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```
Verify: `node -v` → should print `v20.x.x`

### Step 3: Install Docker & Docker Compose
```bash
sudo apt install docker.io docker-compose -y
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker ubuntu
```
> [!IMPORTANT]
> After the `usermod` command, **you MUST disconnect and reconnect SSH** or Docker commands will fail with permission errors:
> ```bash
> exit
> ssh -i ~/.ssh/taskforge-key.pem ubuntu@54.91.123.45
> ```

### Step 4: Install Nginx
```bash
sudo apt install nginx -y
sudo systemctl enable nginx
sudo systemctl start nginx
```
Quick test: Open `http://54.91.123.45` in your browser → you should see the Nginx welcome page! This confirms HTTP port 80 is open.

### Step 5: Install PM2
```bash
sudo npm install -g pm2
```
Verify: `pm2 -v`

---

## PHASE 4 — Clone Your Code

```bash
cd ~
git clone https://github.com/Ramya-Shah/TaskForge.git
cd TaskForge
```

---

## PHASE 5 — Start the Database Infrastructure

```bash
docker-compose up -d
```

Verify both containers are running:
```bash
docker ps
```
You should see `taskforge_redis` and `taskforge_postgres` both with status `Up`.

---

## PHASE 6 — Fix the Frontend Socket URL

> [!WARNING]
> This is the **most commonly missed step**. Your React app is hardcoded to talk to `http://localhost:3001`. When deployed, the browser runs on YOUR computer — not the server — so `localhost` will point to your local machine instead of EC2. You must update this URL.

Edit the Dashboard file:
```bash
nano ~/TaskForge/frontend/src/components/Dashboard.tsx
```
Find this line near the top:
```typescript
const SOCKET_URL = 'http://localhost:3001';
```
Change it to your EC2 IP:
```typescript
const SOCKET_URL = 'http://54.91.123.45:3001';
```
Also search for `http://localhost:3001` in all the `fetch()` calls inside the same file and update those too. 

Save: `Ctrl+X` → `Y` → `Enter`.

---

## PHASE 7 — Configure Nginx

### Step 1: Create the Frontend Web Root
Nginx will serve your compiled React app from here:
```bash
sudo mkdir -p /var/www/taskforge/frontend/dist
```

### Step 2: Link the Nginx Config
```bash
# Remove the default welcome page config
sudo rm /etc/nginx/sites-enabled/default

# Symlink your repo's nginx.conf into Nginx's active config folder
sudo ln -s ~/TaskForge/nginx.conf /etc/nginx/sites-enabled/taskforge.conf

# Test syntax
sudo nginx -t
```
Expected output: `syntax is ok` and `test is successful`.

### Step 3: Reload Nginx
```bash
sudo systemctl reload nginx
```

---

## PHASE 8 — Run the Deployment Script

This single script does everything: compiles TypeScript, builds the React dashboard, and boots PM2.

```bash
chmod +x ~/TaskForge/deploy.sh
~/TaskForge/deploy.sh
```

What the script does step-by-step:
1. `git pull` → pulls the latest code
2. `cd backend && npm install && npx tsc` → compiles TypeScript into `backend/dist/`
3. `cd frontend && npm install && npm run build` → compiles React into `frontend/dist/`
4. `pm2 reload ecosystem.config.js` → boots 1 API server + 3 worker nodes via PM2
5. `sudo systemctl restart nginx` → reloads Nginx

### Step 2: Copy Frontend Build to Nginx Web Root
```bash
sudo cp -r ~/TaskForge/frontend/dist/* /var/www/taskforge/frontend/dist/
```

---

## PHASE 9 — Verify Everything is Running

### Check PM2 processes
```bash
pm2 list
```
You should see:
- `taskforge-api` → `online`  
- `taskforge-worker` (3 instances) → `online`

### Stream live backend logs
```bash
pm2 logs taskforge-api --lines 50
```

### Test the API directly from the server
```bash
curl -X POST http://localhost:3001/jobs \
  -H "Content-Type: application/json" \
  -d '{"type": "test_job", "payload": {"msg": "hello from EC2!"}}'
```
Expected: `{"message": "Job queued successfully", "jobId": "..."}`

---

## PHASE 10 — Access Your Live Dashboard!

Open your browser and go to:
```
http://54.91.123.45
```

Your full TaskForge React dashboard will load — live, in production, on the public internet!

---

## PHASE 11 — Survive Server Reboots

Make PM2 auto-restart your processes whenever EC2 is rebooted:
```bash
pm2 startup
```
Copy and run the exact command it prints (starts with `sudo env PATH=...`), then save the process list:
```bash
pm2 save
```

---

## Future Deployments (Every Time You Push New Code)

Push from your Windows machine → then SSH into EC2 and run:
```bash
cd ~/TaskForge
./deploy.sh
sudo cp -r frontend/dist/* /var/www/taskforge/frontend/dist/
```
That's it. PM2 does a zero-downtime reload automatically.

---

## Troubleshooting Table

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| `docker: permission denied` | Not in docker group yet | Run `newgrp docker` or reconnect SSH |
| Dashboard loads but all stats show 0 | Port 3001 blocked in AWS | Add port 3001 to EC2 Security Group inbound rules |
| Nginx shows `502 Bad Gateway` | PM2 API server crashed | Run `pm2 logs taskforge-api` to see error |
| WebSocket won't connect | Still pointing to `localhost` | Update `SOCKET_URL` in Dashboard.tsx to EC2 IP |
| `pm2: command not found` in deploy.sh | Run as wrong user | Ensure you're `ubuntu` user, re-run `sudo npm i -g pm2` |
| `nginx -t` fails | Broken nginx.conf path | Verify the `root` path in `nginx.conf` matches your actual folder |
