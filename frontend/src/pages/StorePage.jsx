import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, X, Trash2, ShoppingBag, Package, Store, ChevronRight, MapPin, Heart, Star, Zap, Check } from 'lucide-react';
import { api, createSocket } from '../api';
import Navbar from '../components/Navbar';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'mens-shirts', label: 'Shirts' },
  { value: 'tops', label: 'Tops' },
  { value: 'womens-dresses', label: 'Dresses' },
  { value: 'mens-shoes', label: 'Men Shoes' },
  { value: 'womens-shoes', label: 'Women Shoes' },
  { value: 'mens-watches', label: 'Watches' },
  { value: 'sunglasses', label: 'Eyewear' },
  { value: 'womens-bags', label: 'Bags' },
];

const ORDER_STEPS = [
  'SEARCHING_RIDER',
  'RIDER_ASSIGNED',
  'PICKED_UP',
  'AT_DOORSTEP',
  'TRY_IN_PROGRESS',
  'DECISION_SUBMITTED',
  'COMPLETED',
];

function getLiveOrderCopy(order) {
  switch (order.status) {
    case 'SEARCHING_RIDER':
      return {
        title: 'Finding a Trybo rider near you',
        subtitle: 'Broadcasting your Try Bag to nearby partners...',
        dotClass: 'bg-amber-400 animate-ping',
      };
    case 'RIDER_ASSIGNED':
      return {
        title: `${order.rider?.name || 'Rider'} is on the way to store`,
        subtitle: 'Picking up your sealed Try Bag',
        dotClass: 'bg-sky-400 animate-pulse',
      };
    case 'PICKED_UP':
      return {
        title: 'Out for delivery · Arriving soon',
        subtitle: `${order.rider?.name || 'Rider'} is heading to your door`,
        dotClass: 'bg-sky-400 animate-pulse',
      };
    case 'AT_DOORSTEP':
      return {
        title: 'Rider arrived at your doorstep!',
        subtitle: `Share Handover OTP: ${order.handoverOtp}`,
        dotClass: 'bg-emerald-400 animate-ping',
      };
    case 'TRY_IN_PROGRESS':
      return {
        title: '15-min trial active',
        subtitle: 'Tap to mark items Keep or Return',
        dotClass: 'bg-[#FF3F6C] animate-pulse',
      };
    case 'DECISION_SUBMITTED':
      return {
        title: 'Hand back returned items',
        subtitle: `Share Return OTP: ${order.returnOtp}`,
        dotClass: 'bg-emerald-400 animate-pulse',
      };
    default:
      return {
        title: order.status.replaceAll('_', ' '),
        subtitle: 'Tap to view details',
        dotClass: 'bg-neutral-400',
      };
  }
}

export default function StorePage() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('trybo_cart') || '[]');
    } catch {
      return [];
    }
  });
  const [wishlist, setWishlist] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('trybo_wishlist') || '[]');
    } catch {
      return [];
    }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'orders'
  const [deliveryAddress, setDeliveryAddress] = useState(
    () => localStorage.getItem('trybo_address') || '42 MG Road, Indiranagar'
  );
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem('trybo_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem('trybo_wishlist', JSON.stringify(wishlist));
  }, [wishlist]);

  useEffect(() => {
    localStorage.setItem('trybo_address', deliveryAddress);
  }, [deliveryAddress]);

  useEffect(() => {
    loadProducts();
  }, [category, search]);

  useEffect(() => {
    loadMyOrders();
  }, []);

  const liveOrder = orders.find((o) => !['COMPLETED', 'CANCELLED'].includes(o.status));

  useEffect(() => {
    if (!liveOrder) return;
    const socket = createSocket();
    socket.emit('JOIN_ORDER', liveOrder.id);

    socket.on('ORDER_UPDATED', (updatedOrder) => {
      setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));
    });

    return () => {
      socket.emit('LEAVE_ORDER', liveOrder.id);
      socket.disconnect();
    };
  }, [liveOrder?.id]);

  async function loadProducts() {
    const res = await api.get('/catalog/products', { params: { category, search: search || undefined } });
    setProducts(res.data.products);
  }

  async function loadMyOrders() {
    const res = await api.get('/orders/my');
    setOrders(res.data.orders);
  }

  function toggleSizeInCart(product, size) {
    const existingIndex = cart.findIndex(
      (item) => item.product.id === product.id && item.sizeSelected === size
    );

    if (existingIndex !== -1) {
      setCart((prev) => prev.filter((_, idx) => idx !== existingIndex));
      setToast(`Removed ${size} from Try Bag`);
      setTimeout(() => setToast(''), 1600);
      return;
    }

    if (cart.length >= 6) {
      setError('Max 6 items per Try Bag.');
      setCartOpen(true);
      return;
    }

    setError('');
    setCart((prev) => [
      ...prev,
      { tempId: `${product.id}-${size}-${Date.now()}-${Math.random()}`, product, sizeSelected: size },
    ]);
    setToast(`Added ${size} to Try Bag`);
    setTimeout(() => setToast(''), 1600);
  }

  function toggleWishlist(id) {
    setWishlist((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function removeFromCart(tempId) {
    setCart((prev) => prev.filter((item) => item.tempId !== tempId));
  }

  const maxHoldTotal = cart.reduce((sum, item) => sum + item.product.price, 0);

  async function handleCheckout() {
    if (cart.length === 0) return;
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        deliveryAddress,
        items: cart.map((c) => ({
          productId: c.product.id,
          sizeSelected: c.sizeSelected,
        })),
      };
      const res = await api.post('/orders', payload);
      setCart([]);
      setCartOpen(false);
      navigate(`/orders/${res.data.order.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  }

  const liveCopy = liveOrder ? getLiveOrderCopy(liveOrder) : null;
  const liveStepIdx = liveOrder ? ORDER_STEPS.indexOf(liveOrder.status) : 0;
  const liveProgressPct = liveOrder ? Math.round(((liveStepIdx + 1) / ORDER_STEPS.length) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F8F8FA] relative">
      <Navbar />

      {/* Scrollable Inner Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'orders' ? (
          <div className="px-4 py-5 space-y-3">
            <h1 className="text-lg font-bold text-neutral-950">Your Try & Buy Orders</h1>
            {orders.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center text-sm text-neutral-400 border border-neutral-100">
                No orders yet. Add 2+ sizes to try at home!
              </div>
            ) : (
              orders.map((order) => (
                <Link
                  key={order.id}
                  to={`/orders/${order.id}`}
                  className="block bg-white p-4 rounded-2xl border border-neutral-100 hover:border-[#FF3F6C] transition shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-950">{order.deliveryAddress}</p>
                      <p className="text-xs text-neutral-500 mt-1">
                        {order.items.length} items ·{' '}
                        {order.status === 'COMPLETED'
                          ? `Paid $${order.finalAmountPaid.toFixed(2)}`
                          : `Hold $${order.maxHoldAmount.toFixed(2)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${
                          order.status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : order.status === 'CANCELLED'
                            ? 'bg-neutral-100 text-neutral-500'
                            : 'bg-rose-50 text-[#FF3F6C]'
                        }`}
                      >
                        {order.status.replaceAll('_', ' ')}
                      </span>
                      <ChevronRight size={15} className="text-neutral-400" />
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        ) : (
          <div>
            {/* Swiggy/Zomato Style Location Bar */}
            <div className="bg-white px-4 pt-2.5 pb-2 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <MapPin size={14} className="text-[#FF3F6C] shrink-0" />
                <span className="font-semibold text-neutral-900 truncate">{deliveryAddress}</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">
                FREE TRIAL
              </span>
            </div>

            {/* Search Bar */}
            <div className="bg-white px-4 pb-3">
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search shirts, sneakers, dresses..."
                  className="w-full pl-9 pr-3 py-2.5 text-xs bg-neutral-100 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#FF3F6C]/30"
                />
              </div>
            </div>

            {/* Promo Banner */}
            {category === 'all' && !search && (
              <div className="px-4 pt-3">
                <div className="bg-gradient-to-r from-[#FF3F6C] via-[#FF5E5B] to-[#FF8A00] rounded-2xl p-4 text-white shadow-sm">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider bg-white/20 w-fit px-2 py-0.5 rounded-full">
                    <Zap size={10} className="fill-white" /> 30-Min Fitting Room
                  </div>
                  <p className="text-base font-bold mt-2 leading-tight">
                    Order up to 6 sizes. Keep only what fits.
                  </p>
                  <p className="text-[11px] text-white/85 mt-0.5">
                    15-minute doorstep trial · Zero return pickup hassle
                  </p>
                </div>
              </div>
            )}

            {/* Underlined Category Tabs */}
            <div className="flex gap-5 px-4 mt-3 bg-white border-b border-neutral-100 overflow-x-auto">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={`py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition cursor-pointer ${
                    category === cat.value
                      ? 'border-[#FF3F6C] text-[#FF3F6C]'
                      : 'border-transparent text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* 2-Column Myntra/Shein Style Product Grid */}
            <div className="grid grid-cols-2 gap-3 px-4 py-4">
              {products.map((product) => {
                const isLiked = wishlist.includes(product.id);
                const rating = (4.2 + ((product.id * 7) % 7) * 0.1).toFixed(1);

                return (
                  <div
                    key={product.id}
                    className="bg-white rounded-2xl overflow-hidden border border-neutral-100 flex flex-col shadow-2xs"
                  >
                    <div className="relative aspect-[3/4] bg-[#F5F4F8] flex items-center justify-center overflow-hidden">
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-full h-full object-cover mix-blend-multiply"
                      />
                      <button
                        type="button"
                        onClick={() => toggleWishlist(product.id)}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow-xs cursor-pointer"
                      >
                        <Heart
                          size={13}
                          className={isLiked ? 'fill-[#FF3F6C] text-[#FF3F6C]' : 'text-neutral-400'}
                        />
                      </button>
                      <span className="absolute bottom-2 left-2 inline-flex items-center gap-0.5 bg-white/95 px-1.5 py-0.5 rounded-md text-[10px] font-bold text-neutral-800 shadow-2xs">
                        {rating} <Star size={9} className="fill-amber-400 text-amber-400" />
                      </span>
                    </div>

                    <div className="p-2.5 flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="text-xs font-semibold text-neutral-900 line-clamp-1">
                          {product.title}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs font-bold text-neutral-950 tabular-nums">
                            ${product.price.toFixed(2)}
                          </span>
                          <span className="text-[9px] font-bold text-[#FF3F6C] bg-rose-50 px-1.5 py-0.5 rounded">
                            TRY FREE
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-1 mt-2.5">
                        {product.availableSizes.map((size) => {
                          const inBag = cart.some(
                            (c) => c.product.id === product.id && c.sizeSelected === size
                          );
                          return (
                            <button
                              key={size}
                              onClick={() => toggleSizeInCart(product, size)}
                              className={`flex-1 h-7 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                                inBag
                                  ? 'bg-[#FF3F6C] border-[#FF3F6C] text-white shadow-2xs'
                                  : 'bg-neutral-50 border-neutral-200 text-neutral-700 hover:border-[#FF3F6C] hover:text-[#FF3F6C]'
                              }`}
                            >
                              {size}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Top Floating Added-to-Bag Popup Toast */}
      {toast && (
        <div className="absolute top-15 left-1/2 -translate-x-1/2 z-40 bg-neutral-950 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-1.5 whitespace-nowrap pointer-events-none">
          <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center">
            <Check size={10} strokeWidth={3} />
          </span>
          <span>{toast}</span>
        </div>
      )}

      {/* Zepto/Myntra Style Floating View Try Bag Bar */}
      {cart.length > 0 && activeTab === 'catalog' && (
        <div className="shrink-0 px-3 pt-1.5 pb-1 bg-[#F8F8FA]">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full bg-[#FF3F6C] hover:bg-[#e6335d] text-white rounded-2xl px-4 py-3 shadow-md flex items-center justify-between transition cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center">
                <ShoppingBag size={14} />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold leading-tight">
                  {cart.length} {cart.length === 1 ? 'item' : 'items'} in Try Bag
                </p>
                <p className="text-[10px] text-white/85 tabular-nums">
                  Max hold ${maxHoldTotal.toFixed(2)} · Free 15m trial
                </p>
              </div>
            </div>
            <div className="flex items-center gap-0.5 text-xs font-bold">
              <span>View Bag</span>
              <ChevronRight size={15} />
            </div>
          </button>
        </div>
      )}

      {/* Zomato/Swiggy Style Floating Live Order Dock */}
      {liveOrder && liveCopy && (
        <div className="shrink-0 px-3 pb-2 pt-1.5 bg-[#F8F8FA]">
          <Link
            to={`/orders/${liveOrder.id}`}
            className="block bg-[#181824] text-white rounded-2xl p-3.5 shadow-lg hover:bg-[#202030] transition"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative flex items-center justify-center w-3 h-3 shrink-0">
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${liveCopy.dotClass}`} />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{liveCopy.title}</p>
                  <p className="text-[11px] text-neutral-300 truncate">{liveCopy.subtitle}</p>
                </div>
              </div>

              <div className="flex items-center gap-0.5 shrink-0 text-[11px] font-semibold text-[#FF3F6C] bg-white/10 px-2.5 py-1 rounded-full">
                <span>Track</span>
                <ChevronRight size={13} />
              </div>
            </div>

            <div className="mt-2.5 h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#FF3F6C] to-[#FF8A00] rounded-full transition-all duration-500"
                style={{ width: `${liveProgressPct}%` }}
              />
            </div>
          </Link>
        </div>
      )}

      {/* Pinned Bottom Navigation Bar */}
      <nav className="shrink-0 bg-white border-t border-neutral-200 px-6 h-14 flex items-center justify-around z-20">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold cursor-pointer ${
            activeTab === 'catalog' ? 'text-[#FF3F6C]' : 'text-neutral-400'
          }`}
        >
          <Store size={18} />
          <span>Shop</span>
        </button>

        <button
          onClick={() => setCartOpen(true)}
          className="relative flex flex-col items-center gap-0.5 text-[10px] font-semibold text-neutral-700 cursor-pointer"
        >
          <div className="relative">
            <ShoppingBag size={18} className={cart.length > 0 ? 'text-[#FF3F6C]' : ''} />
            {cart.length > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-[#FF3F6C] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {cart.length}
              </span>
            )}
          </div>
          <span>Try Bag</span>
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`relative flex flex-col items-center gap-0.5 text-[10px] font-semibold cursor-pointer ${
            activeTab === 'orders' ? 'text-[#FF3F6C]' : 'text-neutral-400'
          }`}
        >
          <div className="relative">
            <Package size={18} />
            {liveOrder && (
              <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </div>
          <span>Orders</span>
        </button>
      </nav>

      {/* Mobile Bottom Sheet for Try Bag */}
      {cartOpen && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/45" onClick={() => setCartOpen(false)} />
          <div className="relative bg-white rounded-t-3xl p-5 z-10 max-h-[85%] flex flex-col">
            <div className="w-10 h-1 bg-neutral-200 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h2 className="text-base font-bold text-neutral-950">Your Try Bag ({cart.length}/6)</h2>
              <button onClick={() => setCartOpen(false)} className="p-1 text-neutral-400 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            {error && (
              <div className="mt-3 p-2.5 rounded-xl bg-rose-50 text-rose-700 text-xs font-medium">{error}</div>
            )}

            <div className="flex-1 overflow-y-auto divide-y divide-neutral-100 my-2">
              {cart.length === 0 ? (
                <p className="py-10 text-center text-xs text-neutral-400">
                  Add multiple sizes to try at your doorstep for 15 minutes.
                </p>
              ) : (
                cart.map((item) => (
                  <div key={item.tempId} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={item.product.imageUrl}
                        alt={item.product.title}
                        className="w-11 h-12 object-contain bg-[#F5F4F8] rounded-lg p-1"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-neutral-950 truncate">{item.product.title}</p>
                        <p className="text-[11px] text-neutral-500">
                          Size {item.sizeSelected} · ${item.product.price.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.tempId)}
                      className="text-neutral-400 hover:text-rose-600 p-1 cursor-pointer"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-neutral-100 space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-neutral-500 mb-1">Delivery address</label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:border-[#FF3F6C]"
                />
              </div>

              <div className="flex justify-between text-xs text-neutral-600">
                <span>15-min doorstep trial</span>
                <span className="font-bold text-emerald-600">FREE</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-neutral-950">
                <span>Max pre-auth hold</span>
                <span className="tabular-nums">${maxHoldTotal.toFixed(2)}</span>
              </div>

              <button
                onClick={handleCheckout}
                disabled={cart.length === 0 || submitting}
                className="w-full bg-[#FF3F6C] hover:bg-[#e6335d] text-white text-sm font-semibold py-3.5 rounded-xl transition disabled:opacity-40 cursor-pointer shadow-sm"
              >
                {submitting ? 'Dispatching rider...' : 'Order Try & Buy Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
