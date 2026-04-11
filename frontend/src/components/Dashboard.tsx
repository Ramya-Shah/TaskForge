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

// ── Shared card surface style ──────────────────────────────────────────────────
const card: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #d6e8cc',
  borderRadius: 14,
  boxShadow: '0 1px 4px rgba(47,139,63,0.06), 0 4px 16px rgba(47,139,63,0.04)',
  transition: 'box-shadow 0.2s, transform 0.2s',
};

const cardHover = {
  boxShadow: '0 4px 20px rgba(47,139,63,0.14)',
  transform: 'translateY(-1px)',
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
          // Increased from 5s to 15s to handle browser tab throttling when user looks away
          if (now - next[id].lastSeen > 15000) {
            delete next[id];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 2000);

    // Auto-resync when the user returns to this tab (handles tab throttling)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resyncFromDB();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // ── Metric card definitions ────────────────────────────────────────────────
  const metricCards = [
    {
      label: 'Pending',
      value: stats.pending,
      icon: <Activity size={18} />,
      color: '#2F5B8B',
      bg: '#eef2fb',
      accent: '#2F8B3F',
    },
    {
      label: 'Processing',
      value: stats.processing,
      icon: <Cpu size={18} />,
      color: '#1e6b6b',
      bg: '#e2f5f5',
      accent: '#7FB77E',
      pulse: true,
    },
    {
      label: 'Completed',
      value: stats.completed,
      icon: <CheckCircle2 size={18} />,
      color: '#2F8B3F',
      bg: '#eef7ee',
      accent: '#2F8B3F',
    },
    {
      label: 'Delayed',
      value: stats.delayed,
      icon: <Clock size={18} />,
      color: '#7a5200',
      bg: '#fff8dc',
      accent: '#F7C85C',
    },
    {
      label: 'Dead Letter',
      value: stats.dlq,
      icon: <ServerCrash size={18} />,
      color: '#8b1a1a',
      bg: '#fdf0f0',
      accent: '#e57373',
    },
    {
      label: 'Live TPS',
      value: tps,
      icon: <Zap size={18} />,
      color: '#2F8B3F',
      bg: '#FFF6C0',
      accent: '#F7C85C',
      isTps: true,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Metric Cards ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
        {metricCards.map(c => (
          <div
            key={c.label}
            style={{ ...card, padding: '20px 18px', cursor: 'default' }}
            onMouseEnter={e => Object.assign((e.currentTarget as HTMLElement).style, cardHover)}
            onMouseLeave={e => Object.assign((e.currentTarget as HTMLElement).style, { boxShadow: card.boxShadow, transform: 'none' })}
          >
            {/* Icon row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{
                backgroundColor: c.bg,
                color: c.color,
                borderRadius: 10,
                padding: 8,
                display: 'flex',
                alignItems: 'center',
                border: `1px solid ${c.color}22`,
              }}>
                {c.icon}
              </div>

              {c.isTps && tps > 0 && (
                <span style={{ fontSize: 9, fontWeight: 800, color: '#7a5200', backgroundColor: '#FFF6C0', border: '1px solid #F7C85C', padding: '2px 7px', borderRadius: 20, letterSpacing: '0.08em' }}>LIVE</span>
              )}
              {c.pulse && stats.processing > 0 && (
                <span style={{ position: 'relative', display: 'flex', width: 8, height: 8 }}>
                  <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: '#7FB77E', opacity: 0.7, animation: 'ping 1.5s ease-in-out infinite' }} />
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#7FB77E', display: 'block' }} />
                </span>
              )}
            </div>

            {/* Value */}
            <div style={{
              fontSize: 34,
              fontWeight: 800,
              color: c.isTps ? c.color : '#1a2e1c',
              letterSpacing: '-0.04em',
              lineHeight: 1,
              marginBottom: 6,
            }}>
              {c.value}
            </div>

            {/* Label */}
            <div style={{ fontSize: 11, color: '#4a6b4c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {c.label}
            </div>

            {/* Bottom accent bar */}
            <div style={{ height: 3, borderRadius: 2, backgroundColor: c.accent, marginTop: 14, opacity: 0.5 }} />
          </div>
        ))}
      </div>

      {/* ── Admin Console ─────────────────────────────────────────────────── */}
      <div style={{
        ...card,
        padding: '14px 20px',
        display: 'flex',
        flexWrap: 'wrap' as const,
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        background: 'linear-gradient(135deg, #ffffff 0%, #f5fbf5 100%)',
      }}>
        {/* Label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'linear-gradient(135deg, #2F8B3F, #7FB77E)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(47,139,63,0.3)',
          }}>
            <Cpu size={18} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2e1c' }}>Admin Console</div>
            <div style={{ fontSize: 11, color: '#7a9b7c', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Infrastructure Commands</div>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
          {/* Pause / Resume */}
          <button
            onClick={async () => { await fetch(`/queue/${isPaused ? 'resume' : 'pause'}`, { method: 'POST' }); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: isPaused ? '1.5px solid #b8ddb8' : '1.5px solid #f0a0a0',
              backgroundColor: isPaused ? '#eef7ee' : '#fdf0f0',
              color: isPaused ? '#2F8B3F' : '#8b1a1a',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
            {isPaused ? 'Resume Processing' : 'Pause Queue'}
          </button>

          {/* Replay DLQ */}
          <button
            onClick={async () => await fetch('/jobs/replay_dlq', { method: 'POST' })}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: '1.5px solid #a0d4d4', backgroundColor: '#e2f5f5', color: '#1e6b6b',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <RefreshCw size={14} /> Replay DLQ
          </button>

          {/* Purge */}
          <button
            onClick={async () => { if (confirm('Permanently erase all pending and delayed jobs?')) { await fetch('/queue/purge', { method: 'POST' }); } }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: '1.5px solid #d6e8cc', backgroundColor: '#f5fbf5', color: '#4a6b4c',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <Trash2 size={14} style={{ color: '#8b1a1a' }} /> Purge Queue
          </button>

          {/* Cleanup Stale */}
          <button
            onClick={async () => { if (confirm('Recover jobs stuck in processing back to pending?')) { await fetch('/queue/cleanup_stale', { method: 'POST' }); } }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: '1.5px solid #b8ddb8', backgroundColor: '#eef7ee', color: '#2F8B3F',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <RefreshCw size={14} /> Cleanup Stale
          </button>
        </div>
      </div>

      {/* ── Workers + Event Log ───────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>

        {/* Worker Nodes */}
        <div style={{ ...card, padding: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1a2e1c', marginTop: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={16} style={{ color: '#2F8B3F' }} />
            Worker Nodes
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.values(workers).length === 0 ? (
              <div style={{
                padding: '20px', textAlign: 'center', color: '#7a9b7c', fontSize: 13,
                border: '1.5px dashed #d6e8cc', borderRadius: 10,
                backgroundColor: '#f5fbf5',
              }}>
                No workers connected
              </div>
            ) : Object.values(workers).map(w => (
              <div key={w.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 10,
                backgroundColor: '#f5fbf5', border: '1px solid #d6e8cc',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ position: 'relative', display: 'flex', width: 8, height: 8 }}>
                    <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: '#2F8B3F', opacity: 0.6, animation: 'ping 1.5s ease-in-out infinite' }} />
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#2F8B3F', display: 'block', position: 'relative' }} />
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#1a2e1c' }}>{w.id}</span>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 800, color: '#2F8B3F',
                  backgroundColor: '#FFF6C0', border: '1px solid #F7C85C',
                  padding: '2px 10px', borderRadius: 20,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>{w.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Event Stream */}
        <div style={{ ...card, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid #e8f0e2' }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1a2e1c', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertOctagon size={16} style={{ color: '#4a6b4c' }} />
              Event Stream
            </h2>
            <span style={{ position: 'relative', display: 'flex', width: 8, height: 8 }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: '#F7C85C', opacity: 0.8, animation: 'ping 1.5s ease-in-out infinite' }} />
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#F7C85C', display: 'block', position: 'relative' }} />
            </span>
          </div>

          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {log.length === 0 ? (
              <div style={{ color: '#7a9b7c', fontSize: 13, fontStyle: 'italic', padding: '8px 0' }}>Waiting for events...</div>
            ) : log.map(entry => (
              <div key={entry.id} style={{
                display: 'flex', alignItems: 'baseline', gap: 12,
                padding: '6px 0', borderBottom: '1px solid #f5fbf5',
              }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#7a9b7c', flexShrink: 0 }}>
                  {new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                </span>
                <span style={{ fontSize: 13, color: '#1a2e1c' }}>{entry.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Job History Table ─────────────────────────────────────────────── */}
      <div style={{ ...card, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid #e8f0e2',
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'linear-gradient(135deg, #f5fbf5, #ffffff)',
        }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #2F8B3F, #7FB77E)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={15} color="white" />
          </div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1a2e1c', margin: 0 }}>Job History</h2>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#7a9b7c', backgroundColor: '#FFF6C0', border: '1px solid #F7C85C', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
            Last 50 · updates every 5s
          </span>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#f5fbf5' }}>
                {[['Job ID', 'left'], ['Type', 'left'], ['Status', 'left'], ['Attempts', 'center'], ['Last Updated', 'right']].map(([h, align]) => (
                  <th key={h} style={{
                    padding: '10px 16px',
                    textAlign: align as 'left' | 'center' | 'right',
                    fontSize: 11, fontWeight: 700, color: '#4a6b4c',
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    borderBottom: '1px solid #d6e8cc',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '36px', textAlign: 'center', color: '#7a9b7c', fontStyle: 'italic' }}>No job records yet</td></tr>
              ) : history.map(job => {
                const sMap: Record<string, [string, string, string]> = {
                  completed:  ['#2F8B3F', '#eef7ee', '#b8ddb8'],
                  processing: ['#1e6b6b', '#e2f5f5', '#a0d4d4'],
                  delayed:    ['#7a5200', '#fff8dc', '#f0d675'],
                  dlq:        ['#8b1a1a', '#fdf0f0', '#e8b0b0'],
                  cancelled:  ['#4a6b4c', '#f5fbf5', '#d6e8cc'],
                  pending:    ['#2F5B8B', '#eef2fb', '#b0c8e8'],
                };
                const [sc, sbg, sb] = sMap[job.status] || sMap.pending;
                return (
                  <tr key={job.id}
                    style={{ borderBottom: '1px solid #f0f7ec', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f5fbf5')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 12, color: '#4a6b4c' }}>{job.id.slice(0, 8)}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 500, color: '#1a2e1c' }}>{job.type}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                        padding: '3px 10px', borderRadius: 20,
                        color: sc, backgroundColor: sbg, border: `1px solid ${sb}`,
                      }}>{job.status}</span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontFamily: 'monospace', color: '#4a6b4c' }}>{job.attempts}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#7a9b7c', fontSize: 12 }}>
                      {new Date(job.updated_at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ping keyframe (shared) */}
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>

    </div>
  );
}
