import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import { initDB, db } from './db';
import { enqueueJob } from './queue/producer';
import { startDelayedJobPoller } from './worker/retryEngine';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
export const io = new Server(httpServer, {
  cors: {
    origin: '*',
  }
});

// Dedicated Redis connection just for subscribing to worker events via Pub/Sub
const redisSubscriber = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

redisSubscriber.subscribe('dashboard:events', (err, count) => {
  if (err) {
    console.error('Failed to subscribe to Redis events', err);
  } else {
    console.log(`Server subscribed to Redis dashboard:events channel.`);
  }
});

// Whenever any worker completes, fails, or processes a job, it hits here
redisSubscriber.on('message', (channel, message) => {
  if (channel === 'dashboard:events') {
    try {
      const parsed = JSON.parse(message);
      // Forward to WebSockets immediately
      io.emit(parsed.event, parsed.data);
    } catch(err) {
      console.error('Failed to parse Redis message:', err);
    }
  }
});

app.get('/jobs/history', async (req, res) => {
  try {
    const result = await db.query('SELECT id, type, status, attempts, created_at, updated_at FROM jobs ORDER BY updated_at DESC LIMIT 50');
    res.status(200).json(result.rows);
  } catch (error: any) {
    console.error('Failed to fetch job history', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/jobs', async (req, res) => {
  try {
    const { type, payload } = req.body;
    if (!type) {
        res.status(400).json({ error: 'Job type is required' });
        return;
    }
    const jobId = await enqueueJob(type, payload);
    
    io.emit('job:queued', { jobId, type });
    io.emit('metrics:throughput', { timestamp: Date.now() });

    res.status(202).json({ message: 'Job queued successfully', jobId });
  } catch (error: any) {
    console.error('Failed to enqueue job', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

io.on('connection', (socket) => {
  console.log('Dashboard connected via WebSocket:', socket.id);
});

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  await initDB();
  
  // Start the background poller pulling delayed/failed jobs back
  startDelayedJobPoller();
  
  httpServer.listen(PORT, () => {
    console.log(`Backend API & WebSocket broadcasing server running on port ${PORT}`);
  });
};

startServer().catch(console.error);
