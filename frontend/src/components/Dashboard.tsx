import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { 
  Activity, 
  CheckCircle2, 
  Clock, 
  AlertOctagon, 
  ServerCrash,
  Cpu,
  FileText,
  Play,
  Pause,
  RefreshCw,
  Trash2,
  Zap
} from 'lucide-react';

const SOCKET_URL = 'http://localhost:3001';

type JobState = {
  pending: number;
  processing: number;
  completed: number;
  delayed: number;
  dlq: number;
};

type JobHistory = {
  id: string;
  type: string;
  status: string;
  attempts: number;
  updated_at: string;
};

type Worker = {
  id: string;
  status: 'active' | 'idle';
  lastSeen: number;
};

export default function Dashboard() {
  const [stats, setStats] = useState<JobState>({
    pending: 0,
    processing: 0,
    completed: 0,
    delayed: 0,
    dlq: 0
  });
  
  const [workers, setWorkers] = useState<Record<string, Worker>>({});
  const [log, setLog] = useState<{id: string, msg: string, time: number}[]>([]);
  const [history, setHistory] = useState<JobHistory[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [tps, setTps] = useState(0);

  // Initial Global Stat Synchronizer
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('http://localhost:3001/jobs/stats');
        if (res.ok) {
          const initialStats = await res.json();
          setStats(initialStats);
        }
      } catch (err) {
        console.error('Failed to fetch initial state aggregates', err);
      }
    };
    fetchStats();
    
    const fetchState = async () => {
      try {
        const res = await fetch('http://localhost:3001/queue/state');
        if (res.ok) setIsPaused((await res.json()).isPaused);
      } catch(err) {}
    };
    fetchState();
  }, []);

  // History API polling
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch('http://localhost:3001/jobs/history');
        if (res.ok) {
          const data = await res.json();
          setHistory(data);
        }
      } catch (err) {
        console.error('Failed to fetch historical data', err);
      }
    };
    fetchHistory();
    const interval = setInterval(fetchHistory, 5000); // 5 sec live sync
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const socket = io(SOCKET_URL);
    
    // TPS Sliding-Window Array
    let pings: number[] = [];
    const tpsInterval = setInterval(() => {
      const now = Date.now();
      pings = pings.filter(t => t > now - 1000);
      setTps(pings.length);
    }, 200);

    const addLog = (msg: string) => {
      setLog(prev => [{ id: Math.random().toString(), msg, time: Date.now() }, ...prev].slice(0, 15));
    };

    socket.on('connect', () => {
      addLog('🔗 Connected to Master Server WebSocket');
    });

    socket.on('job:queued', (data) => {
      setStats(s => ({ ...s, pending: s.pending + 1 }));
      addLog(`⚡ Incoming Job: ${data.jobId.slice(0,6)} (${data.type})`);
    });

    socket.on('worker:heartbeat', (data) => {
      setWorkers(prev => ({
        ...prev,
        [data.workerId]: { id: data.workerId, status: data.status, lastSeen: Date.now() }
      }));
    });

    socket.on('job:processing', (data) => {
      setStats(s => ({ ...s, pending: Math.max(0, s.pending - 1), processing: s.processing + 1 }));
      addLog(`⚙️ Picked up by ${data.workerId}`);
    });

    socket.on('job:completed', (data) => {
      setStats(s => ({ ...s, processing: Math.max(0, s.processing - 1), completed: s.completed + 1 }));
      addLog(`✅ Processed Job: ${data.jobId.slice(0,6)}`);
    });

    socket.on('job:delayed', (data) => {
      setStats(s => ({ ...s, processing: Math.max(0, s.processing - 1), delayed: s.delayed + 1 }));
      addLog(`⏱ Job Delayed: ${data.jobId.slice(0,6)} (Attempt ${data.attempts})`);
    });

    socket.on('job:dlq', (data) => {
      setStats(s => ({ ...s, processing: Math.max(0, s.processing - 1), dlq: s.dlq + 1 }));
      addLog(`💀 DLQ Triggered: ${data.jobId.slice(0,6)} permanently failed`);
    });

    socket.on('queue:state_changed', (data) => setIsPaused(data.isPaused));
    
    socket.on('metrics:throughput', (data) => {
      pings.push(data.timestamp || Date.now());
    });

    return () => {
      clearInterval(tpsInterval);
      socket.disconnect();
    };
  }, []);

  // Clear inactive workers
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setWorkers(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach(id => {
          if (now - next[id].lastSeen > 5000) {
            delete next[id];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Metric Cards */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:shadow-[0_0_15px_rgba(99,102,241,0.15)] transition-all">
          <div className="flex justify-between items-start text-indigo-400">
            <span className="p-2 bg-indigo-500/10 rounded-lg"><Activity size={24} /></span>
          </div>
          <div className="mt-4">
            <h3 className="text-4xl font-bold text-slate-100">{stats.pending}</h3>
            <p className="text-sm font-medium text-slate-500 mt-1 uppercase tracking-wider">Pending</p>
          </div>
        </div>
        
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:shadow-[0_0_15px_rgba(34,211,238,0.15)] transition-all">
          <div className="flex justify-between items-start text-cyan-400">
            <span className="p-2 bg-cyan-500/10 rounded-lg animate-pulse"><Cpu size={24} /></span>
          </div>
          <div className="mt-4">
            <h3 className="text-4xl font-bold text-slate-100">{stats.processing}</h3>
            <p className="text-sm font-medium text-slate-500 mt-1 uppercase tracking-wider">Processing</p>
          </div>
        </div>
        
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:shadow-[0_0_15px_rgba(16,185,129,0.15)] transition-all">
          <div className="flex justify-between items-start text-emerald-400">
            <span className="p-2 bg-emerald-500/10 rounded-lg"><CheckCircle2 size={24} /></span>
          </div>
          <div className="mt-4">
            <h3 className="text-4xl font-bold text-slate-100">{stats.completed}</h3>
            <p className="text-sm font-medium text-slate-500 mt-1 uppercase tracking-wider">Completed</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:shadow-[0_0_15px_rgba(245,158,11,0.15)] transition-all">
          <div className="flex justify-between items-start text-amber-400">
            <span className="p-2 bg-amber-500/10 rounded-lg"><Clock size={24} /></span>
          </div>
          <div className="mt-4">
            <h3 className="text-4xl font-bold text-slate-100">{stats.delayed}</h3>
            <p className="text-sm font-medium text-slate-500 mt-1 uppercase tracking-wider">Delayed</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:shadow-[0_0_15px_rgba(244,63,94,0.15)] transition-all">
          <div className="flex justify-between items-start text-rose-400">
            <span className="p-2 bg-rose-500/10 rounded-lg"><ServerCrash size={24} /></span>
          </div>
          <div className="mt-4">
            <h3 className="text-4xl font-bold text-slate-100">{stats.dlq}</h3>
            <p className="text-sm font-medium text-slate-500 mt-1 uppercase tracking-wider">Dead Letter</p>
          </div>
        </div>

        {/* Live TPS Speedometer */}
        <div className="bg-gradient-to-br from-[#0c1222] to-[#040812] border border-fuchsia-500/30 rounded-2xl p-6 relative overflow-hidden transition-all group shadow-lg">
          <div className="absolute inset-0 bg-fuchsia-500/5 group-hover:bg-fuchsia-500/10 transition-colors"></div>
          <div className="flex justify-between items-start text-fuchsia-400 relative z-10">
            <span className="p-2 bg-fuchsia-500/20 rounded-lg animate-pulse shadow-[0_0_15px_rgba(217,70,239,0.4)]"><Zap size={24} /></span>
          </div>
          <div className="mt-4 relative z-10 flex flex-col items-start">
            <h3 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-purple-400">
              {tps}
            </h3>
            <p className="text-sm font-medium text-fuchsia-500/80 mt-1 uppercase tracking-wider flex items-center gap-2">
              Live TPS
              {tps > 0 && <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fuchsia-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-fuchsia-500"></span>
              </span>}
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Control Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 flex items-center justify-center bg-indigo-500/10 text-indigo-400 rounded-xl shadow-inner">
            <Cpu size={20} />
          </div>
          <div>
            <h3 className="text-slate-200 font-bold border-b border-slate-700/50 pb-0.5">Admin Console</h3>
            <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Live Infrastructure Commands</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={async () => {
              await fetch(`http://localhost:3001/queue/${isPaused ? 'resume' : 'pause'}`, { method: 'POST' });
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all border shadow-lg ${isPaused ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'}`}
          >
            {isPaused ? <Play size={16} /> : <Pause size={16} />}
            {isPaused ? 'Resume Processing' : 'Pause Queue'}
          </button>
          
          <button 
            onClick={async () => await fetch('http://localhost:3001/jobs/replay_dlq', { method: 'POST' })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 transition-all hover:bg-cyan-500/20 shadow-lg"
          >
            <RefreshCw size={16} /> Replay DLQ
          </button>

          <button 
            onClick={async () => {
              if(confirm('Nuclear Option: Are you sure you want to permanently erase all pending jobs?')) {
                await fetch('http://localhost:3001/queue/purge', { method: 'POST' });
              }
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm bg-slate-800 text-slate-200 border border-slate-700 transition-all hover:bg-slate-700 hover:text-white hover:border-red-500/50 group"
          >
             <Trash2 size={16} className="text-red-400 group-hover:animate-bounce" /> Purge Queue
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        {/* Workers List */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-3xl p-6 overflow-hidden relative shadow-lg">
          <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
            <Activity className="text-indigo-400" size={20} /> Active Workers
          </h2>
          <div className="space-y-4">
            {Object.values(workers).length === 0 ? (
              <div className="text-slate-500 text-sm italic p-4 text-center border border-dashed border-slate-800 rounded-xl">No workers connected</div>
            ) : (
              Object.values(workers).map(w => (
                <div key={w.id} className="flex items-center justify-between p-4 rounded-2xl bg-[#0b1121] border border-slate-800 shadow-inner group transition-all hover:bg-slate-800/80">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 group-hover:animate-ping absolute"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 relative"></div>
                    </div>
                    <span className="font-mono text-sm font-semibold text-slate-200">{w.id}</span>
                  </div>
                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest font-bold">
                    {w.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live Logs */}
        <div className="lg:col-span-2 bg-[#020614] border border-slate-800 rounded-3xl p-6 font-mono text-sm shadow-inner relative overflow-hidden">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800/60 z-10 relative">
             <h2 className="text-lg font-bold font-sans flex items-center gap-2 text-slate-200"><AlertOctagon className="text-slate-500" size={20} /> Event Stream</h2>
             <span className="flex h-2 w-2">
               <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-indigo-400 opacity-75"></span>
               <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
             </span>
          </div>
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-4 z-10 relative">
            {log.length === 0 ? (
              <div className="text-slate-600 italic">Waiting for events...</div>
            ) : (
              log.map(entry => (
                <div key={entry.id} className="text-slate-300 py-1 transition-all">
                  <span className="text-slate-600 mr-3 hidden sm:inline-block">[{new Date(entry.time).toISOString().split('T')[1].slice(0, 12)}]</span>
                  {entry.msg}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Embedded Job History Master Table */}
      <div className="bg-[#020614] border border-slate-800 rounded-3xl p-6 shadow-xl mt-8">
        <h2 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-200">
          <FileText className="text-indigo-400" size={20} /> Real-Time Job History
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-800 font-sans">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="text-[11px] font-bold uppercase bg-slate-950/80 text-slate-400 tracking-wider">
              <tr>
                <th scope="col" className="px-6 py-4 border-b border-slate-800">Job ID</th>
                <th scope="col" className="px-6 py-4 border-b border-slate-800">Type</th>
                <th scope="col" className="px-6 py-4 border-b border-slate-800">Status</th>
                <th scope="col" className="px-6 py-4 border-b border-slate-800 text-center">Attempts</th>
                <th scope="col" className="px-6 py-4 border-b border-slate-800 text-right">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500 bg-slate-900/20 italic">No historical data records found...</td>
                </tr>
              ) : (
                history.map((job) => (
                  <tr key={job.id} className="bg-transparent border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 font-mono text-slate-400">{job.id.slice(0, 8)}</td>
                    <td className="px-6 py-4 font-medium text-slate-300">{job.type}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 text-[10px] uppercase font-bold tracking-widest rounded-full border ${
                        job.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        job.status === 'processing' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                        job.status === 'delayed' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                        job.status === 'dlq' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                        'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                      }`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center font-mono text-slate-400">{job.attempts}</td>
                    <td className="px-6 py-4 text-right tabular-nums text-slate-500">
                      {new Date(job.updated_at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second:'2-digit' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
