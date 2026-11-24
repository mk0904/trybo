import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Bike, CheckCircle2, Sparkles } from 'lucide-react';
import { api, createSocket } from '../api';
import Navbar from '../components/Navbar';
import TryTimer from '../components/TryTimer';

const STEPS = [
  { key: 'SEARCHING_RIDER', label: 'Finding rider', desc: 'Broadcasting your Try Bag to nearby partners...' },
  { key: 'RIDER_ASSIGNED', label: 'Rider assigned', desc: 'Your rider is heading to the hub to pick up your bag' },
  { key: 'PICKED_UP', label: 'On the way', desc: 'Your sealed Try Bag is out for 30-min delivery' },
  { key: 'AT_DOORSTEP', label: 'At your doorstep', desc: 'Share your Handover OTP below to start your 15m trial' },
  { key: 'TRY_IN_PROGRESS', label: '15-min trial active', desc: 'Try everything on and mark Keep or Return below' },
  { key: 'DECISION_SUBMITTED', label: 'Return handover', desc: 'Hand back unwanted items and share your Return OTP' },
  { key: 'COMPLETED', label: 'Order settled', desc: 'Paid only for what you kept. Unused hold released!' },
];

export default function CustomerOrderPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadOrder();

    const socket = createSocket();
    socket.emit('JOIN_ORDER', id);
    socket.on('ORDER_UPDATED', (updatedOrder) => setOrder(updatedOrder));

    return () => {
      socket.emit('LEAVE_ORDER', id);
      socket.disconnect();
    };
  }, [id]);

  async function loadOrder() {
    try {
      const res = await api.get(`/orders/${id}`);
      const loaded = res.data.order;
      setOrder(loaded);

      const saved = JSON.parse(localStorage.getItem(`trybo_decisions_${id}`) || '{}');
      const initial = {};
      for (const item of loaded.items) {
        initial[item.id] = item.decision === 'PENDING' ? (saved[item.id] || 'KEPT') : item.decision;
      }
      setDecisions(initial);
    } catch {
      setError('Could not load order');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    try {
      const res = await api.post(`/orders/${id}/cancel`);
      setOrder(res.data.order);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not cancel order');
    }
  }

  async function handleSubmitDecision() {
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        decisions: order.items.map((item) => ({
          orderItemId: item.id,
          decision: decisions[item.id] || 'KEPT',
        })),
      };
      const res = await api.post(`/orders/${id}/decision`, payload);
      setOrder(res.data.order);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit decision');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-10 text-center text-xs text-neutral-500">Loading order...</div>;
  if (!order) return <div className="p-10 text-center text-xs text-rose-600">{error || 'Order not found'}</div>;

  const currentStepIdx = STEPS.findIndex((s) => s.key === order.status);
  const activeStep = STEPS[currentStepIdx];
  const keptTotal = order.items.reduce((sum, item) => {
    const choice = decisions[item.id] || 'KEPT';
    return choice === 'KEPT' ? sum + item.priceAtOrder : sum;
  }, 0);
  const savedAmount = order.maxHoldAmount - keptTotal;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F8F8FA]">
      <Navbar
        rightSlot={
          <Link to="/store" className="text-xs font-semibold text-neutral-600 hover:text-[#FF3F6C] flex items-center gap-1">
            <ArrowLeft size={14} /> Shop
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Live Status Card */}
        <div className="bg-white rounded-2xl p-4 border border-neutral-100 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono text-neutral-400">#{order.id.slice(0, 8)}</span>
            {['SEARCHING_RIDER', 'RIDER_ASSIGNED'].includes(order.status) && (
              <button onClick={handleCancel} className="text-xs font-semibold text-rose-600 cursor-pointer">
                Cancel order
              </button>
            )}
          </div>

          <h1 className="text-lg font-bold text-neutral-950 mt-1">
            {order.status === 'CANCELLED' ? 'Order cancelled' : activeStep?.label}
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {order.status === 'CANCELLED' ? 'No charges were made.' : activeStep?.desc}
          </p>

          {order.status !== 'CANCELLED' && (
            <div className="grid grid-cols-7 gap-1 mt-4">
              {STEPS.map((step, idx) => (
                <div
                  key={step.key}
                  className={`h-1.5 rounded-full transition-all ${
                    idx <= currentStepIdx
                      ? 'bg-gradient-to-r from-[#FF3F6C] to-[#FF8A00]'
                      : 'bg-neutral-200'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {order.status === 'TRY_IN_PROGRESS' && (
          <TryTimer startedAt={order.tryStartedAt} durationSeconds={order.tryDurationSeconds} />
        )}

        {error && <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-medium">{error}</div>}

        {/* Rider & OTP Pass */}
        {order.rider && (
          <div className="bg-white rounded-2xl p-4 border border-neutral-100 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-50 text-[#FF3F6C] flex items-center justify-center">
                  <Bike size={18} />
                </div>
                <div>
                  <p className="text-[11px] text-neutral-400 font-medium">Your Trybo Partner</p>
                  <p className="text-sm font-bold text-neutral-950">{order.rider.name}</p>
                </div>
              </div>
              <span className="text-xs font-mono font-medium text-neutral-600 bg-neutral-100 px-2.5 py-1 rounded-lg">
                {order.rider.phone}
              </span>
            </div>

            {order.status === 'AT_DOORSTEP' && (
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#181824] to-[#262638] text-white flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold">Handover OTP</p>
                  <p className="text-[10px] text-neutral-300">Tell rider to start 15m trial</p>
                </div>
                <span className="text-2xl font-mono font-bold tracking-[0.2em] text-[#FF8A00]">
                  {order.handoverOtp}
                </span>
              </div>
            )}

            {order.status === 'DECISION_SUBMITTED' && (
              <div className="p-3.5 rounded-xl bg-emerald-600 text-white flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold">Return OTP</p>
                  <p className="text-[10px] text-emerald-100">Share after handing back returns</p>
                </div>
                <span className="text-2xl font-mono font-bold tracking-[0.2em]">
                  {order.returnOtp}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Garment List */}
        <div className="bg-white rounded-2xl p-4 border border-neutral-100 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              {order.status === 'TRY_IN_PROGRESS' ? 'Tap Keep or Return' : 'Items in Try Bag'}
            </h2>
            <span className="text-xs font-medium text-neutral-500">Hold ${order.maxHoldAmount.toFixed(2)}</span>
          </div>

          <div className="divide-y divide-neutral-100">
            {order.items.map((item) => {
              const currentDecision =
                order.status === 'TRY_IN_PROGRESS' ? decisions[item.id] : item.decision;

              return (
                <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={item.product.imageUrl}
                      alt={item.product.title}
                      className="w-12 h-14 object-contain bg-[#F5F4F8] rounded-lg p-1 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-neutral-950 truncate">{item.product.title}</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Size {item.sizeSelected} · ${item.priceAtOrder.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {order.status === 'TRY_IN_PROGRESS' ? (
                    <div className="flex bg-neutral-100 p-1 rounded-xl shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setDecisions((prev) => {
                            const next = { ...prev, [item.id]: 'KEPT' };
                            localStorage.setItem(`trybo_decisions_${id}`, JSON.stringify(next));
                            return next;
                          })
                        }
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                          currentDecision === 'KEPT' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-neutral-500'
                        }`}
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDecisions((prev) => {
                            const next = { ...prev, [item.id]: 'RETURNED' };
                            localStorage.setItem(`trybo_decisions_${id}`, JSON.stringify(next));
                            return next;
                          })
                        }
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                          currentDecision === 'RETURNED' ? 'bg-[#FF3F6C] text-white shadow-2xs' : 'text-neutral-500'
                        }`}
                      >
                        Return
                      </button>
                    </div>
                  ) : (
                    <span
                      className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full shrink-0 ${
                        item.decision === 'KEPT'
                          ? 'bg-emerald-50 text-emerald-700'
                          : item.decision === 'RETURNED'
                          ? 'bg-rose-50 text-[#FF3F6C]'
                          : 'bg-neutral-100 text-neutral-500'
                      }`}
                    >
                      {item.decision}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {order.status === 'COMPLETED' && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-950">Settled & completed!</p>
                <p className="text-[11px] text-emerald-700">Unused pre-auth hold released</p>
              </div>
            </div>
            <p className="text-lg font-extrabold text-emerald-950 tabular-nums">
              ${order.finalAmountPaid.toFixed(2)}
            </p>
          </div>
        )}
      </div>

      {/* Pinned Bottom Settlement Bar */}
      {order.status === 'TRY_IN_PROGRESS' && (
        <div className="shrink-0 bg-white border-t border-neutral-200 px-4 py-3 flex items-center justify-between gap-4 z-20">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] text-neutral-500 font-medium">Final bill</p>
              {savedAmount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                  <Sparkles size={9} /> Saved ${savedAmount.toFixed(2)}
                </span>
              )}
            </div>
            <p className="text-lg font-extrabold text-neutral-950 tabular-nums">${keptTotal.toFixed(2)}</p>
          </div>
          <button
            onClick={handleSubmitDecision}
            disabled={submitting}
            className="flex-1 bg-[#FF3F6C] hover:bg-[#e6335d] text-white text-sm font-semibold py-3 rounded-xl transition cursor-pointer shadow-sm"
          >
            {submitting ? 'Settling...' : 'Confirm & Pay'}
          </button>
        </div>
      )}
    </div>
  );
}
