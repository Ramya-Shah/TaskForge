import Redis from 'ioredis';
import { db } from '../db';
import { handleJobFailure } from './retryEngine';

// We need an independent Redis connection for blocking (BLPOP) operations
const redisBlocking = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
});
// Normal connection for publishing dashboard events
const redisPublisher = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

const WORKER_ID = `worker-${Math.random().toString(36).substring(2, 7)}`;

export const startWorker = async () => {
  console.log(`[Worker ${WORKER_ID}] Booting up queue processor...`);
  
  // Register worker heartbeat for the frontend Dashboard's health view
  setInterval(() => {
    redisPublisher.publish('dashboard:events', JSON.stringify({
        event: 'worker:heartbeat',
        data: { workerId: WORKER_ID, status: 'active', timestamp: Date.now() }
    }));
  }, 2000);
  
  while (true) {
    try {
      // Admin Control: Check if queue is paused globally
      const isPaused = await redisPublisher.get('queue:taskforge:paused');
      if (isPaused === 'true') {
         await new Promise(r => setTimeout(r, 1000));
         continue; // Loop back and sleep transparently without pulling jobs
      }

      // Changed from 0 (infinite block) to 1 (1s timeout) so the while loop safely restarts and checks the `isPaused` flag!
      const result = await redisBlocking.blpop('queue:taskforge:jobs', 1);
      if (result) {
        const [_, jobData] = result;
        const job = JSON.parse(jobData);
        const { id, type, payload } = job;
        
        try {
            console.log(`[Worker ${WORKER_ID}] Pulled Job ${id} (${type})`);
            
            // Mark job as 'processing' in relational db
            await db.query("UPDATE jobs SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
            
            // Real-time notification to React Dashboard
            await redisPublisher.publish('dashboard:events', JSON.stringify({
                event: 'job:processing',
                data: { jobId: id, type, workerId: WORKER_ID }
            }));

            // ---- EXECUTE JOB (Simulate random delay) ----
            await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
            // To effectively demonstrate Retry and DLQ: give it a 30% failure rate
            if (type === 'poison_pill_task') {
                throw new Error("Fatal: Poison pill task always fails to demonstrate DLQ routing!");
            } else if (Math.random() < 0.3) {
                throw new Error("Generic failure simulation");
            }
            // ---------------------------------------------

            // Success Path
            await db.query("UPDATE jobs SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
            console.log(`[Worker ${WORKER_ID}] Successfully processed Job ${id}`);
            
            await redisPublisher.publish('dashboard:events', JSON.stringify({
                event: 'job:completed',
                data: { jobId: id, type, workerId: WORKER_ID }
            }));
            
        } catch (execError: any) {
            console.error(`[Worker ${WORKER_ID}] Error processing ${id}: ${execError.message}`);
            // Let the RetryEngine handle backoff / Dead Letter mapping
            await handleJobFailure(id, type, payload);
        }
      }
    } catch (error) {
       console.error(`[Worker ${WORKER_ID}] Critical Redis connection error:`, error);
       await new Promise(r => setTimeout(r, 1000)); // prevents tight crash loops
    }
  }
}

// Automatically start if ran directly from Node (e.g. ts-node src/worker/worker.ts)
if (require.main === module) {
  startWorker().catch(console.error);
}
