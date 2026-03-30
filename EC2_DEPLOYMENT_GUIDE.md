# AWS EC2 Deployment Guide

The `TaskForge` repository is fully configured for a production deployment to an Ubuntu Linux Virtual Private Server (like AWS EC2 or DigitalOcean). We use **Docker** for the database/queue, **PM2** to manage the Node processes, and **Nginx** to serve the React frontend and proxy our WebSocket API.

## 1. Launch & Prepare the Server
1. Launch an Ubuntu 22.04 LTS (or similar) instance.
2. SSH into the instance.
3. Install Docker: `sudo apt install docker.io docker-compose -y`
4. Install Node.js: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs`
5. Install Nginx: `sudo apt install nginx -y`
6. Install PM2 globally: `sudo npm install -g pm2`

## 2. Clone the Code & Start Infrastructure
1. Clone your repository: `git clone https://github.com/YourUsername/TaskForge.git && cd TaskForge`
2. Spin up the Redis queue engine and PostgreSQL natively:
```bash
sudo docker-compose up -d
```

## 3. Link Nginx
1. Remove the default Nginx test page configuration: `sudo rm /etc/nginx/sites-enabled/default`
2. Symlink your local repo's `nginx.conf` over to Nginx:
```bash
# Remember to change the absolute path to point to your TaskForge folder!
sudo ln -s ~/TaskForge/nginx.conf /etc/nginx/sites-enabled/taskforge.conf
```

## 4. Run the Deployment Script
We built a `deploy.sh` script to automate compiling Typescript, compiling the React UI, and cleanly booting the PM2 instances. 
```bash
chmod +x deploy.sh
./deploy.sh
```

**That's it!** Navigate to your EC2 public IP address in your browser. The Nginx server will flawlessly route `/jobs` and Socket.io events down into PM2, and your background workers will independently crunch jobs!
