import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { 
  Activity, 
  CheckCircle2, 
  Clock, 
  AlertOctagon, 
  ServerCrash,
  Cpu
} from 'lucide-react';

const SOCKET_URL = 'http://localhost:3001';

type JobState = {
  pending: number;
  processing: number;
  completed: number;
  delayed: number;
  dlq: number;
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

  useEffect(() => {
    const socket = io(SOCKET_URL);

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

    return () => {
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
    </div>
  );
}
