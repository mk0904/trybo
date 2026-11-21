import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, ShoppingBag, Bike } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [role, setRole] = useState('CUSTOMER');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, register } = useAuth();
  const navigate = useNavigate();

  function fillDemo(demoRole) {
    setIsLogin(true);
    setError('');
    if (demoRole === 'CUSTOMER') {
      setEmail('customer@trybo.com');
      setPassword('password123');
    } else {
      setEmail('rider@trybo.com');
      setPassword('password123');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let loggedInUser;
      if (isLogin) {
        loggedInUser = await login(email, password);
      } else {
        loggedInUser = await register({ name, email, phone, password, role });
      }
      navigate(loggedInUser.role === 'RIDER' ? '/rider' : '/store');
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col justify-between overflow-y-auto bg-white">
      <div>
        {/* Vibrant Top Hero Banner */}
        <div className="bg-gradient-to-br from-[#FF3F6C] via-[#FF5757] to-[#FF8A00] text-white px-6 pt-10 pb-8 rounded-b-3xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-2xl tracking-[-0.04em]">trybo.</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-white/20 backdrop-blur-xs px-2.5 py-1 rounded-full">
              <Zap size={12} className="fill-white" /> 30-Min Delivery
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-6 leading-snug">
            Try at home. <br />Pay only for what fits.
          </h1>
          <p className="text-xs text-white/85 mt-1.5">
            Order multiple sizes · 15-min doorstep trial · Instant free returns
          </p>
        </div>

        <div className="px-6 pt-6">
          <div className="flex gap-6 border-b border-neutral-200 mb-5">
            <button
              type="button"
              onClick={() => setIsLogin(true)}
              className={`pb-2.5 text-sm font-semibold border-b-2 transition cursor-pointer ${
                isLogin ? 'border-[#FF3F6C] text-neutral-950' : 'border-transparent text-neutral-400'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setIsLogin(false)}
              className={`pb-2.5 text-sm font-semibold border-b-2 transition cursor-pointer ${
                !isLogin ? 'border-[#FF3F6C] text-neutral-950' : 'border-transparent text-neutral-400'
              }`}
            >
              Create account
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {!isLogin && (
              <>
                <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setRole('CUSTOMER')}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition ${
                      role === 'CUSTOMER' ? 'bg-white text-[#FF3F6C] shadow-xs' : 'text-neutral-500'
                    }`}
                  >
                    <ShoppingBag size={14} /> Shopper
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('RIDER')}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition ${
                      role === 'RIDER' ? 'bg-white text-emerald-600 shadow-xs' : 'text-neutral-500'
                    }`}
                  >
                    <Bike size={14} /> Rider
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Full name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Aarav Sharma"
                    className="w-full px-3.5 py-2.5 text-sm bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#FF3F6C]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Phone</label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 9876543210"
                    className="w-full px-3.5 py-2.5 text-sm bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#FF3F6C]"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 text-sm bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#FF3F6C]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 text-sm bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#FF3F6C]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FF3F6C] hover:bg-[#e6335d] text-white text-sm font-semibold py-3 rounded-xl transition disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {loading ? 'Please wait...' : isLogin ? 'Continue' : 'Create account'}
            </button>
          </form>
        </div>
      </div>

      <div className="px-6 py-5 mt-4 border-t border-neutral-100 bg-neutral-50/70">
        <p className="text-[11px] font-medium text-neutral-400 mb-2.5">One-tap demo login</p>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => fillDemo('CUSTOMER')}
            className="text-xs font-semibold py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-[#FF3F6C] transition cursor-pointer"
          >
            Shopper Demo
          </button>
          <button
            type="button"
            onClick={() => fillDemo('RIDER')}
            className="text-xs font-semibold py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition cursor-pointer"
          >
            Rider Demo
          </button>
        </div>
      </div>
    </div>
  );
}
