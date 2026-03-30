import Redis from 'ioredis';
import crypto from 'crypto';
import { db } from '../db';

export const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

redis.on('connect', () => {
    console.log('Redis: Queue Producer connected.');
});

export const enqueueJob = async (type: string, payload: any) => {
  const jobId = crypto.randomUUID();
  
  // 1. Insert into DB (Status = pending)
  await db.query(
    'INSERT INTO jobs (id, type, payload, status) VALUES ($1, $2, $3, $4)',
    [jobId, type, JSON.stringify(payload), 'pending']
  );

  const jobData = JSON.stringify({ id: jobId, type, payload });
  
  // 2. Push to Redis List (Our Fast Queue)
  await redis.rpush('queue:taskforge:jobs', jobData);
  
  return jobId;
}
