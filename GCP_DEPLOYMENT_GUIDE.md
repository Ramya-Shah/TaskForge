# TaskForge — Complete GCP Production Deployment Guide

> [!IMPORTANT]
> This guide deploys TaskForge on a **Free-Tier eligible** Google Cloud Platform (GCP) Compute Engine instance.
> Budget: **$0/month** using the GCP Free Tier (1 e2-micro VM in us-west1, us-central1 or us-east1 is always free).

---

## PHASE 1 — Provision Your GCP VM Instance

### Step 1: Create a Google Cloud Account
Go to [https://cloud.google.com](https://cloud.google.com) and click **Get Started for Free**. A credit card is required for verification but **you won't be charged** within Free Tier limits.

### Step 2: Create a New Project
1. In the GCP Console, click the project dropdown at the top → **New Project**.
2. **Project name:** `taskforge`
3. Click **Create** and wait for it to be ready.

### Step 3: Launch a Compute Engine VM
1. In the GCP Console, navigate to **Compute Engine → VM Instances**.
2. Click **Create Instance**.
3. **Name:** `taskforge-server`
4. **Region:** Select `us-central1` (Iowa) — required for Free Tier eligibility.
5. **Machine configuration:**
   - Series: `E2`
   - Machine Type: `e2-micro` (Free tier — 2 vCPU, 1GB RAM)
6. **Boot Disk:**
   - Click **Change**
   - OS: `Ubuntu`, Version: `Ubuntu 22.04 LTS`
   - Size: `30 GB` (Free tier includes 30 GB standard persistent disk)
   - Click **Select**
7. **Firewall:**
   - ✅ Check **Allow HTTP traffic** (opens port 80)
   - ✅ Check **Allow HTTPS traffic** (optional, for future SSL)
8. Click **Create** → wait ~60 seconds until the VM status shows a green checkmark.
9. Note your VM's **External IP address** (e.g., `34.121.45.67`). **Save this — it is your server's address!**

### Step 4: Open Port 3001 (for Direct API Access)
1. Go to **VPC Network → Firewall** in the GCP Console.
2. Click **Create Firewall Rule**.
3. Fill in:
   - **Name:** `allow-taskforge-api`
   - **Targets:** All instances in the network
   - **Source IPv4 ranges:** `0.0.0.0/0`
   - **Protocols and ports:** Check `TCP` → enter `3001`
4. Click **Create**.

> [!NOTE]
> If you are using Nginx as a proxy (recommended), you may skip opening port 3001 publicly.

---

## PHASE 2 — SSH Into Your Server from Windows

GCP provides a built-in SSH browser terminal, but you can also use your local machine.

### Option A: Browser SSH (Easiest)
In the VM Instances list, click the **SSH** button next to your VM. A browser terminal opens instantly — **no keys required**.

### Option B: SSH from Windows Terminal/Git Bash
#### Step 1: Generate an SSH Key (if you don't have one)
```bash
ssh-keygen -t rsa -b 4096 -C "your-email@gmail.com" -f ~/.ssh/taskforge-gcp
```

#### Step 2: Add Public Key to your GCP VM
1. In GCP Console → **Compute Engine → VM Instances** → Click your VM name → **Edit**.
2. Scroll to **SSH Keys** → Click **Add Item**.
3. Paste the contents of `~/.ssh/taskforge-gcp.pub`.
4. **Save**.

#### Step 3: Connect
```bash
ssh -i ~/.ssh/taskforge-gcp your-gcp-username@34.121.45.67
```
Replace `34.121.45.67` with your actual External IP, and `your-gcp-username` with your Google account username (the part before `@gmail.com`).

> [!NOTE]
> You are now **inside your Ubuntu server** running in Google's data center. Every command from this point runs remotely on GCP.

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
sudo usermod -aG docker $USER
```
> [!IMPORTANT]
> After the `usermod` command, **you MUST disconnect and reconnect SSH** or Docker commands will fail with permission errors:
> ```bash
> exit
> ssh -i ~/.ssh/taskforge-gcp your-gcp-username@34.121.45.67
> ```

### Step 4: Install Nginx
```bash
sudo apt install nginx -y
sudo systemctl enable nginx
sudo systemctl start nginx
```
Quick test: Open `http://34.121.45.67` in your browser → you should see the Nginx welcome page. This confirms port 80 is open.

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
You should see `taskforge-redis` and `taskforge-postgres` both with status `Up`.

---

## PHASE 6 — Configure Nginx

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

## PHASE 7 — Run the Deployment Script

This single script does everything: compiles TypeScript, builds the React dashboard, and boots PM2.

```bash
chmod +x ~/TaskForge/deploy.sh
~/TaskForge/deploy.sh
```

What the script does step-by-step:
1. `git pull` → pulls the latest code
2. `cd backend && npm install && npx tsc` → compiles TypeScript into `backend/dist/`
3. `cd frontend && npm install && npm run build` → compiles React into `frontend/dist/`
4. Copies frontend build to `/var/www/taskforge/frontend/dist/`
5. `pm2 reload ecosystem.config.js` → boots 1 API server + 6 worker nodes via PM2
6. `sudo systemctl reload nginx` → reloads Nginx

---

## PHASE 8 — Verify Everything is Running

### Check PM2 processes
```bash
pm2 list
```
You should see:
- `taskforge-api` → `online`
- `taskforge-worker` (6 instances) → `online`

### Stream live backend logs
```bash
pm2 logs taskforge-api --lines 50
```

### Test the API directly from the server
```bash
curl -X POST http://localhost:3001/jobs \
  -H "Content-Type: application/json" \
  -d '{"type": "test_job", "payload": {"msg": "hello from GCP!"}}'
```
Expected: `{"message": "Job queued successfully", "jobId": "..."}`

---

## PHASE 9 — Access Your Live Dashboard!

Open your browser and go to:
```
http://34.121.45.67
```

Your full TaskForge React dashboard will load — live, in production, on the public internet!

---

## PHASE 10 — Survive Server Reboots

Make PM2 auto-restart your processes whenever the GCP VM is rebooted:
```bash
pm2 startup
```
Copy and run the exact command it prints (starts with `sudo env PATH=...`), then save the process list:
```bash
pm2 save
```

> [!TIP]
> On GCP, you can also configure the VM to **Never** auto-stop by going to **VM Instances → Edit → Availability policies → On host maintenance: Migrate VM instance**. This keeps your VM running indefinitely.

---

## Future Deployments (Every Time You Push New Code)

Push from your Windows machine → then SSH into GCP and run:
```bash
cd ~/TaskForge
./deploy.sh
```
That's it. PM2 does a zero-downtime reload automatically.

---

## Full Reset (Start Fresh)

To wipe all state and restart from scratch:
```bash
cd ~/TaskForge
./reset_system.sh
```

---

## Troubleshooting Table

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| `docker: permission denied` | Not in docker group yet | Run `newgrp docker` or reconnect SSH |
| Dashboard loads but all stats show 0 | Port 3001 blocked in GCP | Add port 3001 to the GCP Firewall rules |
| Nginx shows `502 Bad Gateway` | PM2 API server crashed | Run `pm2 logs taskforge-api` to see error |
| WebSocket won't connect | Incorrect Nginx proxy config | Run `sudo nginx -t` and check `/etc/nginx/sites-enabled/taskforge.conf` |
| `pm2: command not found` in deploy.sh | Run as wrong user | Ensure you're the right user, re-run `sudo npm i -g pm2` |
| `nginx -t` fails | Broken nginx.conf path | Verify the `root` path in `nginx.conf` matches your actual folder |
| VM stops unexpectedly | GCP preemptible VM | Change VM type to Standard (non-preemptible) in VM settings |
