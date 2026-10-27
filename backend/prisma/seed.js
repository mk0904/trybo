import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const FALLBACK_PRODUCTS = [
  {
    externalId: 1001,
    title: 'Classic White Oxford Shirt',
    category: 'mens-shirts',
    price: 39.99,
    imageUrl: 'https://cdn.dummyjson.com/products/images/mens-shirts/Blue%20&%20Black%20Check%20Shirt/thumbnail.png',
    description: 'Breathable 100% cotton slim-fit shirt suitable for office and casual wear.',
    availableSizes: JSON.stringify(['S', 'M', 'L', 'XL']),
  },
  {
    externalId: 1002,
    title: 'Air Runner Sneakers',
    category: 'mens-shoes',
    price: 89.99,
    imageUrl: 'https://cdn.dummyjson.com/products/images/mens-shoes/Nike%20Air%20Jordan%201%20Red%20And%20Black/thumbnail.png',
    description: 'Lightweight cushioned running sneakers built for all-day comfort.',
    availableSizes: JSON.stringify(['UK 7', 'UK 8', 'UK 9', 'UK 10']),
  },
];

function getSizesForCategory(category) {
  if (category.includes('shoes')) {
    return JSON.stringify(['UK 7', 'UK 8', 'UK 9', 'UK 10']);
  }
  if (category.includes('watches')) {
    return JSON.stringify(['38mm', '40mm', '42mm']);
  }
  if (category === 'sunglasses' || category === 'womens-bags') {
    return JSON.stringify(['One Size']);
  }
  return JSON.stringify(['S', 'M', 'L', 'XL']);
}

export async function seedProductsFromDummyJSON() {
  const categories = [
    'mens-shirts',
    'womens-dresses',
    'mens-shoes',
    'womens-shoes',
    'tops',
    'sunglasses',
    'womens-bags',
    'mens-watches',
  ];
  let seededCount = 0;

  try {
    for (const category of categories) {
      const response = await fetch(`https://dummyjson.com/products/category/${category}`);
      if (!response.ok) continue;

      const data = await response.json();
      for (const item of data.products || []) {
        await prisma.product.upsert({
          where: { externalId: item.id },
          update: {
            title: item.title,
            category: item.category,
            price: item.price,
            imageUrl: item.thumbnail,
            description: item.description,
            availableSizes: getSizesForCategory(item.category),
          },
          create: {
            externalId: item.id,
            title: item.title,
            category: item.category,
            price: item.price,
            imageUrl: item.thumbnail,
            description: item.description,
            availableSizes: getSizesForCategory(item.category),
          },
        });
        seededCount++;
      }
    }
  } catch (error) {
    console.warn('Could not reach DummyJSON API, using fallback products:', error.message);
  }

  if (seededCount === 0) {
    for (const item of FALLBACK_PRODUCTS) {
      await prisma.product.upsert({
        where: { externalId: item.externalId },
        update: item,
        create: item,
      });
      seededCount++;
    }
  }

  return seededCount;
}

async function main() {
  console.log('Seeding Trybo database...');
  const passwordHash = await bcrypt.hash('password123', 10);

  await prisma.user.upsert({
    where: { email: 'customer@trybo.com' },
    update: {},
    create: {
      name: 'Aarav Sharma',
      email: 'customer@trybo.com',
      passwordHash,
      phone: '+91 9876543210',
      role: 'CUSTOMER',
    },
  });

  await prisma.user.upsert({
    where: { email: 'rider@trybo.com' },
    update: {},
    create: {
      name: 'Vikram Singh',
      email: 'rider@trybo.com',
      passwordHash,
      phone: '+91 9123456780',
      role: 'RIDER',
      isOnline: true,
    },
  });

  const count = await seedProductsFromDummyJSON();
  console.log(`Seeded ${count} products and demo accounts.`);
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
