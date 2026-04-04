import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import { initDB, db } from './db';
import { enqueueJob, redis } from './queue/producer';
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

app.get('/jobs/stats', async (req, res) => {
  try {
    const result = await db.query('SELECT status, COUNT(*) as count FROM jobs GROUP BY status');
    
    const stats: Record<string, number> = {
      pending: 0, processing: 0, completed: 0, delayed: 0, dlq: 0
    };
    
    result.rows.forEach(row => {
      if (stats[row.status] !== undefined) {
        stats[row.status] = parseInt(row.count, 10);
      }
    });

    res.status(200).json(stats);
  } catch (error: any) {
    console.error('Failed to fetch job stats aggregates', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/queue/state', async (req, res) => {
  const isPaused = await redis.get('queue:taskforge:paused');
  res.json({ isPaused: isPaused === 'true' });
});

app.post('/queue/pause', async (req, res) => {
  await redis.set('queue:taskforge:paused', 'true');
  io.emit('queue:state_changed', { isPaused: true });
  res.json({ success: true, isPaused: true });
});

app.post('/queue/resume', async (req, res) => {
  await redis.set('queue:taskforge:paused', 'false');
  io.emit('queue:state_changed', { isPaused: false });
  res.json({ success: true, isPaused: false });
});

app.post('/queue/purge', async (req, res) => {
  // 1. Wipe the standard pending queue
  await redis.del('queue:taskforge:jobs');
  // 2. Wipe the hidden exponential backoff sorted set 
  await redis.del('queue:taskforge:delayed');
  
  // 3. Mark all active states as permanently cancelled natively
  await db.query("UPDATE jobs SET status = 'cancelled' WHERE status IN ('pending', 'delayed', 'processing')");
  
  io.emit('queue:purged');
  res.json({ success: true });
});

app.post('/jobs/replay_dlq', async (req, res) => {
  try {
    const result = await db.query("SELECT id, type, payload FROM jobs WHERE status = 'dlq'");
    if (result.rows.length === 0) return res.json({ success: true, count: 0 });
    
    for (const job of result.rows) {
        // Reset directly natively in Postgres
        await db.query("UPDATE jobs SET status = 'pending', attempts = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [job.id]);
        
        // Push payload back into Redis list organically
        const jobData = JSON.stringify({ id: job.id, type: job.type, payload: job.payload });
        await redis.rpush('queue:taskforge:jobs', jobData);
    }
    
    // Broadcast DLQ reset natively
    io.emit('queue:dlq_replayed', { count: result.rows.length });
    res.json({ success: true, count: result.rows.length });
  } catch(e) {
    res.status(500).json({ error: 'Failed' });
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
