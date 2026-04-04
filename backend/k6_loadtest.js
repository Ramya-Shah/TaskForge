import http from 'k6/http';
import { check } from 'k6';

// The "Stages" natively throttle the Go Virtual Users (VUs) upward and downward elegantly.
export const options = {
  stages: [
    { duration: '10s', target: 50 },  // 1. Warm Up: Ramp linearly up to 50 concurrent simulated users
    { duration: '30s', target: 300 }, // 2. The Squeeze: Spike to 300 VUs and hold the barrage natively
    { duration: '10s', target: 0 },   // 3. Cool Down: Scale down gracefully to 0 VUs
  ],
};

const jobTypes = ['send_email', 'resize_image', 'process_webhook', 'crunch_data', 'poison_pill_task'];

export default function () {
  const url = 'http://localhost:3001/jobs';
  
  // Natively dynamically construct JSON payloads
  const payload = JSON.stringify({
    // Maintain a 5% chance of a poison pill so we can trigger DLQ under heavy load!
    type: Math.random() < 0.05 ? 'poison_pill_task' : jobTypes[Math.floor(Math.random() * (jobTypes.length - 1))],
    payload: { generated_by: 'k6_benchmarker', timestamp: Date.now() },
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  // Hammer the Post Route!
  const res = http.post(url, payload, params);

  // Assertions (Checks if the Express server begins rejecting/crashing instead of accepting it)
  check(res, {
    'accepted smoothly (202)': (r) => r.status === 202,
  });
}
