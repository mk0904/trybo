import express from 'express';
import prisma from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { canTransition, generateOtp } from '../utils/fsm.js';

const router = express.Router();

// Helper: include full order details
const orderInclude = {
  items: { include: { product: true } },
  customer: { select: { id: true, name: true, phone: true } },
  rider: { select: { id: true, name: true, phone: true } },
};

// POST /api/orders - Place a new Try & Buy order
router.post('/', authRequired, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const { items, deliveryAddress } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart cannot be empty' });
    }
    if (items.length > 6) {
      return res.status(400).json({ error: 'Maximum 6 items allowed per Try & Buy order' });
    }
    if (!deliveryAddress || deliveryAddress.trim().length < 5) {
      return res.status(400).json({ error: 'Valid delivery address is required' });
    }

    // Fetch products from DB to verify prices server-side
    const productIds = [...new Set(items.map((i) => Number(i.productId)))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));
    let maxHoldAmount = 0;
    const orderItemsData = [];

    for (const item of items) {
      const product = productMap.get(Number(item.productId));
      if (!product) {
        return res.status(404).json({ error: `Product ${item.productId} not found` });
      }
      maxHoldAmount += product.price;
      orderItemsData.push({
        productId: product.id,
        sizeSelected: item.sizeSelected || 'M',
        priceAtOrder: product.price,
      });
    }

    const tryDurationSeconds = Number(process.env.TRY_DURATION_SECONDS) || 900;

    const order = await prisma.order.create({
      data: {
        customerId: req.user.id,
        deliveryAddress: deliveryAddress.trim(),
        handoverOtp: generateOtp(),
        returnOtp: generateOtp(),
        maxHoldAmount: Number(maxHoldAmount.toFixed(2)),
        tryDurationSeconds,
        items: { create: orderItemsData },
      },
      include: orderInclude,
    });

    // Broadcast new job to all online riders via Socket.io
    const io = req.app.get('io');
    io.to('riders:online').emit('ORDER_BROADCAST', order);

    res.status(201).json({ order });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// GET /api/orders/my - Get customer's order history
router.get('/my', authRequired, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { customerId: req.user.id },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ orders });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load orders' });
  }
});

// GET /api/orders/:id - Get single order (accessible by its customer or assigned rider)
router.get('/:id', authRequired, async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: orderInclude,
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.customerId !== req.user.id && order.riderId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to view this order' });
    }

    res.json({ order });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load order' });
  }
});

// POST /api/orders/:id/cancel - Cancel order before pickup
router.post('/:id/cancel', authRequired, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.customerId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    if (!canTransition(order.status, 'CANCELLED')) {
      return res.status(400).json({ error: `Cannot cancel order in ${order.status} state` });
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED' },
      include: orderInclude,
    });

    const io = req.app.get('io');
    io.to(`order:${order.id}`).emit('ORDER_UPDATED', updated);
    io.to('riders:online').emit('ORDER_CANCELLED', { orderId: order.id });

    res.json({ order: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// POST /api/orders/:id/decision - Customer submits Keep / Return for each item
router.post('/:id/decision', authRequired, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const { decisions } = req.body; // [{ orderItemId, decision: 'KEPT' | 'RETURNED' }]
    if (!Array.isArray(decisions) || decisions.length === 0) {
      return res.status(400).json({ error: 'Decisions array is required' });
    }

    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.customerId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    if (!canTransition(order.status, 'DECISION_SUBMITTED')) {
      return res.status(400).json({ error: `Order is in ${order.status} state, cannot submit decision` });
    }

    // Validate all items have a valid decision
    const decisionMap = new Map();
    for (const d of decisions) {
      if (d.decision !== 'KEPT' && d.decision !== 'RETURNED') {
        return res.status(400).json({ error: 'Each decision must be KEPT or RETURNED' });
      }
      decisionMap.set(d.orderItemId, d.decision);
    }

    if (decisionMap.size !== order.items.length) {
      return res.status(400).json({ error: 'Please choose KEEP or RETURN for every item' });
    }

    // Atomic transaction: update items, calculate final bill, and update order status
    const updatedOrder = await prisma.$transaction(async (tx) => {
      let finalAmountPaid = 0;
      let returnedCount = 0;

      for (const item of order.items) {
        const chosen = decisionMap.get(item.id);
        if (!chosen) throw new Error('Missing item decision');

        if (chosen === 'KEPT') {
          finalAmountPaid += item.priceAtOrder;
        } else {
          returnedCount++;
        }

        await tx.orderItem.update({
          where: { id: item.id },
          data: { decision: chosen },
        });
      }

      // If customer kept EVERYTHING, no return handover is needed -> auto-complete!
      const nextStatus = returnedCount === 0 ? 'COMPLETED' : 'DECISION_SUBMITTED';

      return tx.order.update({
        where: { id: order.id },
        data: {
          finalAmountPaid: Number(finalAmountPaid.toFixed(2)),
          status: nextStatus,
        },
        include: orderInclude,
      });
    });

    const io = req.app.get('io');
    io.to(`order:${order.id}`).emit('ORDER_UPDATED', updatedOrder);

    res.json({ order: updatedOrder });
  } catch (error) {
    console.error('Decision error:', error);
    res.status(500).json({ error: 'Failed to submit keep/return decision' });
  }
});

export default router;
