# Implementation Plan: K6 Load Testing & Visualizer

You are 100% correct. An arbitrary Node.js script is bottlenecked by its own single-threaded event loop, so it is a terrible load generator. **Grafana k6** is an industry-standard, Go-compiled load testing engine that can easily spawn thousands of concurrent Virtual Users (VUs) without bottlenecking the machine.

## Proposed Changes

### 1. The Enterprise Benchmarker (`k6_loadtest.js`)
Instead of a Node script, we will create a lightweight configuration script expressly for `k6`. 
- It will define stages (e.g., Ramp up to 500 VUs over 20s, hold for 30s, ramp down).
- It will generate random JSON payload profiles mimicking real HTTP behavior.
- We will install `k6` locally using Windows Package Manager (`winget`) or Chocolately depending on your environment.

### 2. Live Dashboard TPS Visualizer
Your Redis API is actually already broadcasting a hidden `io.emit('metrics:throughput')` event!
- **React Frontend (`Dashboard.tsx`)**: We will introduce a sliding-window data array natively inside React.
- Once k6 drops thousands of tasks onto the Express server, your architecture will count how many `metrics:throughput` pings occurred in the exact last 1000ms natively.
- We will add a stunning, pulsing **"Throughput"** statistic to the top of the UI explicitly displaying live **Tasks/sec (TPS)** during the `k6` load storm!

## Verification Plan
1. We will install and run `k6 run k6_loadtest.js`.
2. We will pause the Active Workers to let k6 artificially balloon the DB.
3. We will monitor the new Dashboard TPS metric spike dynamically as k6 crushes the architecture with synthetic concurrent loads!
