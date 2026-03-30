const http = require('http');

const jobTypes = [
  'send_welcome_email', 
  'resize_avatar_image', 
  'generate_monthly_invoice', 
  'process_webhook'
];

async function enqueueJob(type) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ type, payload: { timestamp: Date.now() } });
    const options = {
      hostname: 'localhost', port: 3001, path: '/jobs', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    };
    const req = http.request(options, (res) => resolve(res.statusCode));
    req.on('error', (err) => resolve(err.message));
    req.write(data);
    req.end();
  });
}

async function blast() {
  console.log('🔥 Initiating job queue stress test...');
  let cnt = 0;
  for(let i = 0; i < 50; i++) {
    const type = jobTypes[Math.floor(Math.random() * jobTypes.length)];
    enqueueJob(type);
    cnt++;
    // Add tiny 50ms gaps so we can see the queue dynamically build and tear down
    await new Promise(r => setTimeout(r, 50)); 
  }
  console.log(`✅ Blasted ${cnt} jobs to TaskForge.`);
}

blast();
