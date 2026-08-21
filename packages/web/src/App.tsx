import { Link, Outlet } from 'react-router';

export function App() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-3">
        <Link to="/" className="text-xl font-bold tracking-tight">
          learntree
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/settings" className="text-neutral-600 hover:text-neutral-900">
            Settings
          </Link>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
