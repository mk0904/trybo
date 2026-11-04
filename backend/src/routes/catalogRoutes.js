import express from 'express';
import prisma from '../db.js';
import { seedProductsFromDummyJSON } from '../../prisma/seed.js';

const router = express.Router();

// GET /api/catalog/products?category=...&search=...
router.get('/products', async (req, res) => {
  try {
    const { category, search } = req.query;
    const where = {};

    if (category && category !== 'all') {
      where.category = category;
    }

    if (search) {
      where.title = { contains: search };
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { id: 'asc' },
    });

    const formatted = products.map((p) => ({
      ...p,
      availableSizes: JSON.parse(p.availableSizes),
    }));

    res.json({ products: formatted });
  } catch (error) {
    console.error('Catalog error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// POST /api/catalog/seed
router.post('/seed', async (req, res) => {
  try {
    const count = await seedProductsFromDummyJSON();
    res.json({ message: `Seeded ${count} products from DummyJSON` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to seed catalog' });
  }
});

export default router;
