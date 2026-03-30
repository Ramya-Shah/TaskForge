import { redis } from '../queue/producer';
import { db } from '../db';

export const handleJobFailure = async (jobId: string, jobType: string, payload: any) => {
  const result = await db.query(
    'UPDATE jobs SET attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING attempts',
    [jobId]
  );
  
  const attempts = result.rows[0]?.attempts || 1;

  if (attempts < 5) {
    // Exponential backoff: 2s, 4s, 8s, 16s
    const delayMs = Math.pow(2, attempts) * 1000;
    const executeAt = Date.now() + delayMs;
    
    // Convert status to delayed
    await db.query("UPDATE jobs SET status = 'delayed' WHERE id = $1", [jobId]);

    // Push into Redis Sorted Set (Delayed Queue)
    const jobData = JSON.stringify({ id: jobId, type: jobType, payload });
    await redis.zadd('queue:taskforge:delayed', executeAt, jobData);
    
    await redis.publish('dashboard:events', JSON.stringify({
        event: 'job:delayed',
        data: { jobId, type: jobType, attempts, nextRun: executeAt }
    }));
    
    console.log(`Job ${jobId} failed (${attempts}/5 attempts). Retrying in ${delayMs}ms.`);
  } else {
    // Dead Letter Queue (DLQ) permanent failure after 5 attempts
    await db.query("UPDATE jobs SET status = 'dlq', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [jobId]);
    
    await redis.publish('dashboard:events', JSON.stringify({
        event: 'job:dlq',
        data: { jobId, type: jobType, attempts }
    }));
    
    console.log(`[DLQ] Job ${jobId} permanently failed and moved to Dead Letter Queue.`);
  }
};

// We will let the main server (or a designated chron) trigger this poller to avoid distributed duplication
export const startDelayedJobPoller = () => {
  console.log('Starting Delayed Job Poller...');
  setInterval(async () => {
    const now = Date.now();
    
    // Get all jobs where executeAt <= now
    const jobs = await redis.zrangebyscore('queue:taskforge:delayed', 0, now);
    
    for (const job of jobs) {
      // Small chance of race condition gracefully handled in advanced systems, 
      // but fine for our scope: we remove it first, if successful, we push it to ready queue.
      const removed = await redis.zrem('queue:taskforge:delayed', job);
      if (removed) {
          await redis.rpush('queue:taskforge:jobs', job);
          const parsed = JSON.parse(job);
          await db.query("UPDATE jobs SET status = 'pending' WHERE id = $1", [parsed.id]);
          console.log(`Job ${parsed.id} matured. Moved from delayed Set back to Active Queue.`);
      }
    }
  }, 1000); // Polling every second
};
