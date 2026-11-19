import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Navbar({ rightSlot }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <header className="shrink-0 bg-white border-b border-neutral-100 z-20">
      <div className="px-4 h-13 flex items-center justify-between">
        <Link
          to={user?.role === 'RIDER' ? '/rider' : '/store'}
          className="flex items-center gap-2"
        >
          <span className="font-extrabold text-xl tracking-[-0.04em] text-neutral-950">
            trybo<span className="text-[#FF3F6C]">.</span>
          </span>
          {user?.role === 'RIDER' ? (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Partner
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-[#FF3F6C]">
              <Zap size={10} className="fill-[#FF3F6C]" /> 30m
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2.5">
          {rightSlot}
          {user && (
            <button
              onClick={handleLogout}
              title="Sign out"
              className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-950 hover:bg-neutral-100 transition cursor-pointer"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
