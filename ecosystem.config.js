module.exports = {
  apps: [
    {
      name: "taskforge-api",
      script: "./backend/dist/server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: "production",
        PORT: 3001
      }
    },
    {
      name: "taskforge-worker",
      script: "./backend/dist/worker/worker.js",
      instances: 6, // Automatically spawn 6 independent workers in parallel!
      exec_mode: "cluster_mode",
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
