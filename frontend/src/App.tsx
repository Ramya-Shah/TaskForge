import Dashboard from './components/Dashboard'
function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 pt-12 text-left">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex items-center justify-between border-b pb-6 mb-8" style={{ borderColor: 'rgba(51, 65, 85, 0.4)' }}>
          <div>
            <h1 className="text-4xl font-extrabold pb-2" style={{
              background: 'linear-gradient(to right, #818cf8, #c084fc)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>TaskForge Engine</h1>
            <p className="text-slate-400 mt-1">Distributed Task Queue Observer</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-emerald-400 font-medium tracking-wide text-sm hidden sm:inline-block">SYSTEM ONLINE</span>
          </div>
        </header>

        <main>
          <Dashboard />
        </main>
      </div>
    </div>
  );
}

export default App;
