import Dashboard from './components/Dashboard'

function App() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f1f5f9' }}>
      {/* Top Nav Bar */}
      <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <svg width="16" height="16" fill="white" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.01em' }}>
                TaskForge
              </h1>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, fontWeight: 400 }}>
                Distributed Task Engine
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: '#22c55e' }}></span>
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: '#22c55e' }}></span>
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a', letterSpacing: '0.05em' }}>
              LIVE
            </span>
          </div>
        </div>
      </div>

      {/* Page Content */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="mb-6">
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
            System Overview
          </h2>
          <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
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

