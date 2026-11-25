import { useState, useEffect } from 'react';
import { Bike, Wallet, MapPin, Package, CheckCircle2, KeyRound } from 'lucide-react';
import { api, createSocket } from '../api';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import TryTimer from '../components/TryTimer';

export default function RiderDashboardPage() {
  const { user, setUser } = useAuth();
  const [availableJobs, setAvailableJobs] = useState([]);
  const [myJobs, setMyJobs] = useState([]);
  const [tab, setTab] = useState('dispatch'); // 'dispatch' | 'earnings'
  const [handoverOtp, setHandoverOtp] = useState('');
  const [returnOtp, setReturnOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const activeJob = myJobs.find((j) => !['COMPLETED', 'CANCELLED'].includes(j.status));
  const completedJobs = myJobs.filter((j) => j.status === 'COMPLETED');

  useEffect(() => {
    loadJobs();

    const socket = createSocket();

    socket.on('ORDER_BROADCAST', (newOrder) => {
      setAvailableJobs((prev) => [newOrder, ...prev.filter((j) => j.id !== newOrder.id)]);
    });
    socket.on('ORDER_CLAIMED', ({ orderId }) => {
      setAvailableJobs((prev) => prev.filter((j) => j.id !== orderId));
    });
    socket.on('ORDER_CANCELLED', ({ orderId }) => {
      setAvailableJobs((prev) => prev.filter((j) => j.id !== orderId));
    });
    socket.on('ORDER_UPDATED', (updatedOrder) => {
      setMyJobs((prev) => prev.map((j) => (j.id === updatedOrder.id ? updatedOrder : j)));
    });

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    if (!activeJob) return;
    const socket = createSocket();
    socket.emit('JOIN_ORDER', activeJob.id);
    socket.on('ORDER_UPDATED', (updatedOrder) => {
      setMyJobs((prev) => prev.map((j) => (j.id === updatedOrder.id ? updatedOrder : j)));
    });
    return () => {
      socket.emit('LEAVE_ORDER', activeJob.id);
      socket.disconnect();
    };
  }, [activeJob?.id]);

  async function loadJobs() {
    try {
      const [availRes, myRes] = await Promise.all([
        api.get('/rider/jobs/available'),
        api.get('/rider/jobs/my'),
      ]);
      setAvailableJobs(availRes.data.jobs);
      setMyJobs(myRes.data.jobs);
    } catch {
      setError('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }

  async function toggleOnline() {
    try {
      const res = await api.patch('/rider/status', { isOnline: !user.isOnline });
      setUser((prev) => ({ ...prev, isOnline: res.data.user.isOnline }));
    } catch {
      setError('Could not update duty status');
    }
  }

  async function acceptJob(orderId) {
    setError('');
    try {
      const res = await api.post(`/rider/jobs/${orderId}/accept`);
      setAvailableJobs((prev) => prev.filter((j) => j.id !== orderId));
      setMyJobs((prev) => [res.data.order, ...prev]);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not accept job');
      loadJobs();
    }
  }

  async function updateStep(orderId, endpoint, body = {}) {
    setError('');
    try {
      const res = await api.post(`/rider/jobs/${orderId}/${endpoint}`, body);
      setMyJobs((prev) => prev.map((j) => (j.id === orderId ? res.data.order : j)));
      setHandoverOtp('');
      setReturnOtp('');
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed');
    }
  }

  if (loading) return <div className="p-10 text-center text-xs text-neutral-500">Loading partner console...</div>;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F8F8FA]">
      <Navbar
        rightSlot={
          <button
            onClick={toggleOnline}
            className={`px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer transition ${
              user?.isOnline
                ? 'bg-emerald-500 text-white shadow-2xs'
                : 'bg-neutral-200 text-neutral-700'
            }`}
          >
            {user?.isOnline ? '● Online' : 'Offline'}
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {error && <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-medium">{error}</div>}

        {tab === 'earnings' ? (
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-gradient-to-br from-[#141824] to-[#1F2937] text-white shadow-sm">
              <p className="text-xs text-neutral-400">Today’s Earnings</p>
              <p className="text-3xl font-extrabold mt-1 tabular-nums">${(completedJobs.length * 5).toFixed(2)}</p>
              <p className="text-xs text-emerald-400 font-medium mt-1">
                {completedJobs.length} completed Try & Buy trips
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-neutral-100 divide-y divide-neutral-100">
              {completedJobs.length === 0 ? (
                <p className="p-8 text-center text-xs text-neutral-400">No completed trips yet.</p>
              ) : (
                completedJobs.map((job) => (
                  <div key={job.id} className="p-4 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-neutral-950">{job.deliveryAddress}</p>
                      <p className="text-neutral-500 mt-0.5">
                        Customer kept ${job.finalAmountPaid.toFixed(2)} of ${job.maxHoldAmount.toFixed(2)}
                      </p>
                    </div>
                    <span className="font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                      +$5.00
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : activeJob ? (
          <div className="space-y-4">
            {/* Active Partner Trip Header */}
            <div className="p-4 rounded-2xl bg-[#141824] text-white shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                  {activeJob.status.replaceAll('_', ' ')}
                </span>
                <span className="text-xs font-bold text-emerald-400">Payout $5.00</span>
              </div>
              <h2 className="text-base font-bold mt-2.5">{activeJob.customer.name}</h2>
              <p className="text-xs text-neutral-300 flex items-center gap-1 mt-0.5">
                <MapPin size={13} className="text-[#FF3F6C]" /> {activeJob.deliveryAddress}
              </p>
              <p className="text-xs font-mono text-neutral-400 mt-1">{activeJob.customer.phone}</p>
            </div>

            {activeJob.status === 'TRY_IN_PROGRESS' && (
              <TryTimer
                startedAt={activeJob.tryStartedAt}
                durationSeconds={activeJob.tryDurationSeconds}
              />
            )}

            {/* Visual Item Checklist */}
            <div className="bg-white rounded-2xl p-4 border border-neutral-100 shadow-2xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-2">
                {activeJob.status === 'DECISION_SUBMITTED' ? 'Return Audit Checklist' : 'Sealed Try Bag Items'}
              </p>
              <div className="divide-y divide-neutral-100">
                {activeJob.items.map((item) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={item.product.imageUrl}
                        alt={item.product.title}
                        className="w-10 h-11 object-contain bg-[#F5F4F8] rounded-lg p-1 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-neutral-900 truncate">{item.product.title}</p>
                        <p className="text-[11px] text-neutral-500">Size {item.sizeSelected}</p>
                      </div>
                    </div>

                    {activeJob.status === 'DECISION_SUBMITTED' ? (
                      <span
                        className={`font-bold px-2.5 py-1 rounded-full text-[10px] uppercase shrink-0 ${
                          item.decision === 'RETURNED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {item.decision === 'RETURNED' ? 'Collect back' : 'Kept'}
                      </span>
                    ) : (
                      <span className="text-neutral-500 font-medium shrink-0">
                        ${item.priceAtOrder.toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Step Controls */}
            {activeJob.status === 'RIDER_ASSIGNED' && (
              <button
                onClick={() => updateStep(activeJob.id, 'pickup')}
                className="w-full bg-[#10B981] hover:bg-[#059669] text-white text-sm font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <Package size={17} /> Confirm Hub Pickup
              </button>
            )}

            {activeJob.status === 'PICKED_UP' && (
              <button
                onClick={() => updateStep(activeJob.id, 'arrived')}
                className="w-full bg-[#FF3F6C] hover:bg-[#e6335d] text-white text-sm font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <MapPin size={17} /> Arrived at Doorstep
              </button>
            )}

            {activeJob.status === 'AT_DOORSTEP' && (
              <div className="bg-white rounded-2xl p-4 border border-neutral-100 space-y-3">
                <label className="block text-xs font-semibold text-neutral-700">
                  Enter customer’s 4-digit Handover OTP
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={4}
                    value={handoverOtp}
                    onChange={(e) => setHandoverOtp(e.target.value)}
                    placeholder="0000"
                    className="flex-1 px-3 py-3 border border-neutral-200 bg-neutral-50 rounded-xl font-mono text-lg tracking-[0.25em] text-center focus:outline-none focus:bg-white focus:border-[#FF3F6C]"
                  />
                  <button
                    onClick={() => updateStep(activeJob.id, 'start-try', { handoverOtp })}
                    className="bg-[#FF3F6C] text-white text-sm font-bold px-5 rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <KeyRound size={15} /> Start
                  </button>
                </div>
              </div>
            )}

            {activeJob.status === 'TRY_IN_PROGRESS' && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium text-center">
                Customer is trying items inside. Waiting for Keep/Return decision...
              </div>
            )}

            {activeJob.status === 'DECISION_SUBMITTED' && (
              <div className="bg-white rounded-2xl p-4 border border-neutral-100 space-y-3">
                <label className="block text-xs font-semibold text-neutral-700">
                  Collect returned items, then enter Return OTP
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={4}
                    value={returnOtp}
                    onChange={(e) => setReturnOtp(e.target.value)}
                    placeholder="0000"
                    className="flex-1 px-3 py-3 border border-neutral-200 bg-neutral-50 rounded-xl font-mono text-lg tracking-[0.25em] text-center focus:outline-none focus:bg-white focus:border-emerald-600"
                  />
                  <button
                    onClick={() => updateStep(activeJob.id, 'verify-return', { returnOtp })}
                    className="bg-emerald-600 text-white text-sm font-bold px-5 rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 size={15} /> Done
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Compact Partner Earnings Strip */}
            <div className="bg-gradient-to-r from-[#141824] to-[#1F2937] text-white rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-neutral-400">Today’s Earnings</p>
                <p className="text-xl font-extrabold tabular-nums">${(completedJobs.length * 5).toFixed(2)}</p>
              </div>
              <span className="text-xs font-semibold bg-white/10 px-3 py-1 rounded-full">
                {completedJobs.length} Trips
              </span>
            </div>

            <h1 className="text-xs font-bold uppercase tracking-wider text-neutral-400 pt-1">
              Nearby Requests ({availableJobs.length})
            </h1>

            {!user?.isOnline ? (
              <div className="bg-white rounded-2xl p-8 text-center text-xs text-neutral-400 border border-neutral-100">
                Tap <strong>Offline</strong> in the top right to start receiving delivery requests.
              </div>
            ) : availableJobs.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-xs text-neutral-400 border border-neutral-100">
                Waiting for new Try & Buy orders...
              </div>
            ) : (
              availableJobs.map((job) => (
                <div
                  key={job.id}
                  className="bg-white rounded-2xl p-4 border border-neutral-100 shadow-2xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                        Est. Payout $5.00
                      </span>
                      <p className="text-sm font-bold text-neutral-950 mt-2">{job.deliveryAddress}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {job.items.length} items · Bag value ${job.maxHoldAmount.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => acceptJob(job.id)}
                    className="w-full bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold py-2.5 rounded-xl cursor-pointer transition"
                  >
                    Accept Delivery
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Pinned Bottom Tab Bar */}
      <nav className="shrink-0 bg-white border-t border-neutral-200 px-6 h-14 flex items-center justify-around z-20">
        <button
          onClick={() => setTab('dispatch')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold cursor-pointer ${
            tab === 'dispatch' ? 'text-emerald-600' : 'text-neutral-400'
          }`}
        >
          <Bike size={18} />
          <span>Dispatch</span>
        </button>

        <button
          onClick={() => setTab('earnings')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold cursor-pointer ${
            tab === 'earnings' ? 'text-emerald-600' : 'text-neutral-400'
          }`}
        >
          <Wallet size={18} />
          <span>Earnings</span>
        </button>
      </nav>
    </div>
  );
}
