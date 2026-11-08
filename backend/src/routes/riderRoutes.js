import express from 'express';
import prisma from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { canTransition } from '../utils/fsm.js';

const router = express.Router();

const orderInclude = {
  items: { include: { product: true } },
  customer: { select: { id: true, name: true, phone: true } },
  rider: { select: { id: true, name: true, phone: true } },
};

// PATCH /api/rider/status - Toggle Online / Offline
router.patch('/status', authRequired, requireRole('RIDER'), async (req, res) => {
  try {
    const { isOnline } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { isOnline: Boolean(isOnline) },
      select: { id: true, name: true, isOnline: true },
    });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update rider status' });
  }
});

// GET /api/rider/jobs/available - List unassigned orders
router.get('/jobs/available', authRequired, requireRole('RIDER'), async (req, res) => {
  try {
    const jobs = await prisma.order.findMany({
      where: { status: 'SEARCHING_RIDER' },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch available jobs' });
  }
});

// GET /api/rider/jobs/my - List rider's active and completed jobs
router.get('/jobs/my', authRequired, requireRole('RIDER'), async (req, res) => {
  try {
    const jobs = await prisma.order.findMany({
      where: { riderId: req.user.id },
      include: orderInclude,
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rider jobs' });
  }
});

// POST /api/rider/jobs/:id/accept - Atomic claim so two riders cannot claim same order
router.post('/jobs/:id/accept', authRequired, requireRole('RIDER'), async (req, res) => {
  try {
    const result = await prisma.order.updateMany({
      where: {
        id: req.params.id,
        status: 'SEARCHING_RIDER',
        riderId: null,
      },
      data: {
        riderId: req.user.id,
        status: 'RIDER_ASSIGNED',
      },
    });

    if (result.count === 0) {
      return res.status(409).json({ error: 'Order already claimed or unavailable' });
    }

    const updated = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: orderInclude,
    });

    const io = req.app.get('io');
    io.to(`order:${updated.id}`).emit('ORDER_UPDATED', updated);
    io.to('riders:online').emit('ORDER_CLAIMED', { orderId: updated.id });

    res.json({ order: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to accept job' });
  }
});

// POST /api/rider/jobs/:id/pickup - Confirm store pickup
router.post('/jobs/:id/pickup', authRequired, requireRole('RIDER'), async (req, res) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order || order.riderId !== req.user.id) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (!canTransition(order.status, 'PICKED_UP')) {
      return res.status(400).json({ error: `Cannot mark picked up from ${order.status}` });
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: 'PICKED_UP' },
      include: orderInclude,
    });

    req.app.get('io').to(`order:${order.id}`).emit('ORDER_UPDATED', updated);
    res.json({ order: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update pickup status' });
  }
});

// POST /api/rider/jobs/:id/arrived - Mark arrived at customer doorstep
router.post('/jobs/:id/arrived', authRequired, requireRole('RIDER'), async (req, res) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order || order.riderId !== req.user.id) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (!canTransition(order.status, 'AT_DOORSTEP')) {
      return res.status(400).json({ error: `Cannot mark arrived from ${order.status}` });
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: 'AT_DOORSTEP' },
      include: orderInclude,
    });

    req.app.get('io').to(`order:${order.id}`).emit('ORDER_UPDATED', updated);
    res.json({ order: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update arrival status' });
  }
});

// POST /api/rider/jobs/:id/start-try - Verify Handover OTP & start 15-min timer
router.post('/jobs/:id/start-try', authRequired, requireRole('RIDER'), async (req, res) => {
  try {
    const { handoverOtp } = req.body;
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order || order.riderId !== req.user.id) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (!canTransition(order.status, 'TRY_IN_PROGRESS')) {
      return res.status(400).json({ error: `Cannot start try session from ${order.status}` });
    }
    if (String(handoverOtp).trim() !== order.handoverOtp) {
      return res.status(400).json({ error: 'Invalid Handover OTP. Ask the customer for the 4-digit code.' });
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'TRY_IN_PROGRESS',
        tryStartedAt: new Date(),
      },
      include: orderInclude,
    });

    req.app.get('io').to(`order:${order.id}`).emit('ORDER_UPDATED', updated);
    res.json({ order: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start try session' });
  }
});

// POST /api/rider/jobs/:id/verify-return - Verify Return OTP & complete order
router.post('/jobs/:id/verify-return', authRequired, requireRole('RIDER'), async (req, res) => {
  try {
    const { returnOtp } = req.body;
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order || order.riderId !== req.user.id) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (!canTransition(order.status, 'COMPLETED')) {
      return res.status(400).json({ error: `Cannot complete order from ${order.status}` });
    }
    if (String(returnOtp).trim() !== order.returnOtp) {
      return res.status(400).json({ error: 'Invalid Return OTP. Verify returned items and ask customer for code.' });
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: 'COMPLETED' },
      include: orderInclude,
    });

    req.app.get('io').to(`order:${order.id}`).emit('ORDER_UPDATED', updated);
    res.json({ order: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify return' });
  }
});

export default router;
