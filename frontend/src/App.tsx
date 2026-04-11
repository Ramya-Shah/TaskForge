import Dashboard from './components/Dashboard'

function App() {
  return (
    <div style={{ minHeight: '100vh' }}>

      {/* ── Top Nav ──────────────────────────────────────────────────────── */}
      <header style={{
        background: 'linear-gradient(135deg, #2F8B3F 0%, #3d9e50 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.15)',
        boxShadow: '0 2px 16px rgba(47,139,63,0.25)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'rgba(255,246,192,0.25)',
              border: '1.5px solid rgba(255,246,192,0.4)',
              backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}>
              <svg width="18" height="18" fill="#FFF6C0" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: '#FFF6C0', margin: 0, letterSpacing: '-0.02em', lineHeight: 1 }}>
                TaskForge
              </h1>
              <p style={{ fontSize: 11, color: 'rgba(255,246,192,0.65)', margin: 0, fontWeight: 400, letterSpacing: '0.04em' }}>
                Distributed Task Engine
              </p>
            </div>
          </div>

          {/* Live indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8,
            backgroundColor: 'rgba(255,246,192,0.15)', border: '1px solid rgba(255,246,192,0.3)',
            borderRadius: 20, padding: '5px 14px', backdropFilter: 'blur(4px)' }}>
            <span style={{ position: 'relative', display: 'flex', width: 8, height: 8 }}>
              <span style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                backgroundColor: '#F7C85C', opacity: 0.8,
                animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
              }} />
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#F7C85C', display: 'block' }} />
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#FFF6C0', letterSpacing: '0.1em' }}>
              LIVE
            </span>
          </div>
        </div>

        {/* Decorative bar */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, #F7C85C, #7FB77E, #F7C85C)', opacity: 0.6 }} />
      </header>

      {/* Ping animation */}
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>

      {/* ── Page Content ─────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 32px 48px' }}>

        {/* Page heading */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{
              width: 4, height: 28, borderRadius: 2,
              background: 'linear-gradient(180deg, #2F8B3F, #7FB77E)',
            }} />
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#1a2e1c', margin: 0, letterSpacing: '-0.03em' }}>
              System Overview
            </h2>
          </div>
          <p style={{ fontSize: 14, color: '#4a6b4c', marginTop: 0, marginLeft: 16, paddingLeft: 16 }}>
            Real-time monitoring and control of distributed job processing
          </p>
        </div>

        <main>
          <Dashboard />
        </main>
      </div>
    </div>
  );
}

export default App;
