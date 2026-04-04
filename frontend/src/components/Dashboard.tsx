import { useEffect, useState } from 'react';
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

// Empty string = connect to the origin that served this page (Nginx in prod, localhost in dev)
const SOCKET_URL = import.meta.env.VITE_API_URL ?? '';

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
  const [log, setLog] = useState<{ id: string, msg: string, time: number }[]>([]);
  const [history, setHistory] = useState<JobHistory[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [tps, setTps] = useState(0);

  // Initial Global Stat Synchronizer
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/jobs/stats');
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
        const res = await fetch('/queue/state');
        if (res.ok) setIsPaused((await res.json()).isPaused);
      } catch (err) { }
    };
    fetchState();
  }, []);

  // History API polling
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch('/jobs/history');
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
      addLog(`⚡ Incoming Job: ${data.jobId.slice(0, 6)} (${data.type})`);
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
      addLog(`✅ Processed Job: ${data.jobId.slice(0, 6)}`);
    });

    socket.on('job:delayed', (data) => {
      setStats(s => ({ ...s, processing: Math.max(0, s.processing - 1), delayed: s.delayed + 1 }));
      addLog(`⏱ Job Delayed: ${data.jobId.slice(0, 6)} (Attempt ${data.attempts})`);
    });

    socket.on('job:dlq', (data) => {
      setStats(s => ({ ...s, processing: Math.max(0, s.processing - 1), dlq: s.dlq + 1 }));
      addLog(`💀 DLQ Triggered: ${data.jobId.slice(0, 6)} permanently failed`);
    });

    socket.on('queue:state_changed', (data) => setIsPaused(data.isPaused));

    // Instantly re-sync stats + history from DB after a purge or DLQ replay
    const resyncFromDB = async () => {
      try {
        const [statsRes, historyRes] = await Promise.all([
          fetch('/jobs/stats'),
          fetch('/jobs/history'),
        ]);
        if (statsRes.ok) setStats(await statsRes.json());
        if (historyRes.ok) setHistory(await historyRes.json());
      } catch (err) {
        console.error('Failed to resync after purge', err);
      }
    };

    socket.on('queue:purged', () => {
      addLog('🗑️ Queue purged — all pending/delayed jobs cancelled');
      resyncFromDB();
    });

    socket.on('queue:dlq_replayed', (data) => {
      addLog(`♻️ DLQ Replayed — ${data.count} jobs re-queued`);
      resyncFromDB();
    });

    socket.on('queue:reclaimed', (data) => {
      addLog(`♻️ Reclaimed ${data.count} stale jobs back to pending`);
      resyncFromDB();
    });

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
    <div className="space-y-5">

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Pending', value: stats.pending, icon: <Activity size={18} />, color: '#6366f1', bg: '#eef2ff' },
          { label: 'Processing', value: stats.processing, icon: <Cpu size={18} />, color: '#0891b2', bg: '#ecfeff', pulse: true },
          { label: 'Completed', value: stats.completed, icon: <CheckCircle2 size={18} />, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Delayed', value: stats.delayed, icon: <Clock size={18} />, color: '#d97706', bg: '#fffbeb' },
          { label: 'Dead Letter', value: stats.dlq, icon: <ServerCrash size={18} />, color: '#dc2626', bg: '#fef2f2' },
          { label: 'Live TPS', value: tps, icon: <Zap size={18} />, color: '#7c3aed', bg: '#f5f3ff', isTps: true },
        ].map(card => (
          <div key={card.label} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'box-shadow 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)')}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ backgroundColor: card.bg, color: card.color, borderRadius: 8, padding: 6, display: 'flex', alignItems: 'center' }}>{card.icon}</span>
              {card.isTps && tps > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', backgroundColor: '#f5f3ff', padding: '2px 6px', borderRadius: 20, letterSpacing: '0.05em' }}>LIVE</span>}
              {card.pulse && stats.processing > 0 && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: card.color }}></span>
                  <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: card.color }}></span>
                </span>
              )}
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: card.isTps ? card.color : '#0f172a', letterSpacing: '-0.03em', lineHeight: 1 }}>{card.value}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Admin Console */}
      <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px', display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', justifyContent: 'space-between', gap: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#eef2ff', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Cpu size={18} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>Admin Console</div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Infrastructure Commands</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
          <button onClick={async () => { await fetch(`/queue/${isPaused ? 'resume' : 'pause'}`, { method: 'POST' }); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: isPaused ? '1px solid #bbf7d0' : '1px solid #fecaca', backgroundColor: isPaused ? '#f0fdf4' : '#fef2f2', color: isPaused ? '#16a34a' : '#dc2626', cursor: 'pointer', transition: 'all 0.15s' }}>
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
            {isPaused ? 'Resume Processing' : 'Pause Queue'}
          </button>
          <button onClick={async () => await fetch('/jobs/replay_dlq', { method: 'POST' })}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid #bae6fd', backgroundColor: '#f0f9ff', color: '#0369a1', cursor: 'pointer', transition: 'all 0.15s' }}>
            <RefreshCw size={14} /> Replay DLQ
          </button>
          <button onClick={async () => { if (confirm('Permanently erase all pending and delayed jobs?')) { await fetch('/queue/purge', { method: 'POST' }); } }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#475569', cursor: 'pointer', transition: 'all 0.15s' }}>
            <Trash2 size={14} style={{ color: '#ef4444' }} /> Purge Queue
          </button>
          <button onClick={async () => { if (confirm('Recover jobs stuck in processing back to pending?')) { await fetch('/queue/cleanup_stale', { method: 'POST' }); } }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#6366f1', cursor: 'pointer', transition: 'all 0.15s' }}>
            <RefreshCw size={14} /> Cleanup Stale
          </button>
        </div>
      </div>

      {/* Workers + Event Log */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, marginTop: 0 }}>
            <Activity size={16} style={{ color: '#6366f1' }} /> Worker Nodes
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            {Object.values(workers).length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center' as const, color: '#94a3b8', fontSize: 13, border: '1px dashed #e2e8f0', borderRadius: 8 }}>No workers connected</div>
            ) : Object.values(workers).map(w => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="relative w-2 h-2">
                    <div className="w-2 h-2 rounded-full absolute animate-ping opacity-60" style={{ backgroundColor: '#22c55e' }}></div>
                    <div className="w-2 h-2 rounded-full relative" style={{ backgroundColor: '#22c55e' }}></div>
                  </div>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#334155' }}>{w.id}</span>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{w.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <AlertOctagon size={16} style={{ color: '#64748b' }} /> Event Stream
            </h2>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: '#6366f1' }}></span>
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: '#6366f1' }}></span>
            </span>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
            {log.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 13, fontStyle: 'italic' }}>Waiting for events...</div>
            ) : log.map(entry => (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '5px 0', borderBottom: '1px solid #f8fafc' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
                  {new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                </span>
                <span style={{ fontSize: 13, color: '#334155' }}>{entry.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Job History Table */}
      <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={16} style={{ color: '#6366f1' }} />
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: 0 }}>Job History</h2>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>Last 50 · updates every 5s</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                {[['Job ID','left'],['Type','left'],['Status','left'],['Attempts','center'],['Last Updated','right']].map(([h, align]) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: align as 'left'|'center'|'right', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>No job records yet</td></tr>
              ) : history.map(job => {
                const sMap: Record<string, [string, string, string]> = {
                  completed: ['#16a34a','#f0fdf4','#bbf7d0'],
                  processing: ['#0891b2','#ecfeff','#a5f3fc'],
                  delayed: ['#d97706','#fffbeb','#fde68a'],
                  dlq: ['#dc2626','#fef2f2','#fecaca'],
                  cancelled: ['#64748b','#f8fafc','#e2e8f0'],
                  pending: ['#6366f1','#eef2ff','#c7d2fe'],
                };
                const [sc, sbg, sb] = sMap[job.status] || sMap.pending;
                return (
                  <tr key={job.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{job.id.slice(0, 8)}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 500, color: '#334155' }}>{job.type}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '3px 8px', borderRadius: 20, color: sc, backgroundColor: sbg, border: `1px solid ${sb}` }}>{job.status}</span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontFamily: 'monospace', color: '#64748b' }}>{job.attempts}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#94a3b8', fontSize: 12 }}>
                      {new Date(job.updated_at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
