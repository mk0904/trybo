# Trybo — The 15-Minute Doorstep Fitting Room

**Trybo** (*Try Before You Buy*) is a hyperlocal quick-commerce logistics platform that brings the fitting room to the customer’s doorstep in 30 minutes. Shoppers order multiple sizes of apparel, footwear, and accessories, try them on during a **server-synchronized 15-minute trial window** while the rider waits outside, and pay *only* for what they keep—handing rejected items straight back at the door.

Built as a **unified responsive mobile-first web app** (serving both Customers and Delivery Partners from a single codebase via Role-Based Access Control), Trybo focuses on real-world backend engineering: **Finite State Machines, concurrency-safe job claiming, atomic split-billing transactions, Dual-OTP anti-fraud handshakes, and real-time WebSocket synchronization.**

---

## Table of Contents
1. [The Problem & Product Vision](#the-problem--product-vision)
2. [System Architecture](#system-architecture)
3. [Tech Stack & Engineering Decisions](#tech-stack--engineering-decisions)
4. [Order Lifecycle: Finite State Machine (FSM)](#order-lifecycle-finite-state-machine-fsm)
5. [Solving Core Backend Challenges](#solving-core-backend-challenges)
6. [API & WebSocket Reference](#api--websocket-reference)
7. [Local Development Setup](#local-development-setup)

---

## The Problem & Product Vision

Standard e-commerce forces an uncomfortable trade-off around sizing:
* Order one size $\rightarrow$ if it doesn’t fit, wait 5–7 days for reverse pickup and refunds.
* Order two sizes $\rightarrow$ lock up double the capital and still deal with return labels.

For retailers, reverse logistics costs billions annually in return shipping, repackaging, and dead stock. **Trybo eliminates reverse logistics completely** by turning the delivery rider into a 15-minute doorstep fitting-room partner.

---

## System Architecture

```text
+-------------------------------------------------------------------------+
|                    UNIFIED MOBILE-FIRST WEB CLIENT                      |
|               React 18 + Vite + Tailwind CSS + Socket.io                |
|                                                                         |
|   [ Role: CUSTOMER ] /store & /orders/:id   [ Role: RIDER ] /rider      |
|   - Multi-size Try Bag (max 6 items)        - Online/Offline dispatch   |
|   - Live floating bottom order dock         - Step-by-step trip flow    |
|   - 15m synced timer & Keep/Return UI       - Dual-OTP verification     |
+------------------------------------+------------------------------------+
                                     |
                         REST (HTTPS) + WebSockets
                                     |
+------------------------------------v------------------------------------+
|                      BACKEND API & REAL-TIME ENGINE                     |
|                    Node.js + Express + Socket.io                        |
|                                                                         |
|  ├── JWT Auth & RBAC Middleware (CUSTOMER vs RIDER route guards)        |
|  ├── Catalog Ingestion Worker (DummyJSON API -> Relational DB)          |
|  ├── Order FSM Engine (Strict state transition validation)              |
|  └── Socket.io Room Manager (riders:online & order:<id> rooms)          |
+------------------------------------+------------------------------------+
                                     |
                                 Prisma ORM
                                     |
+------------------------------------v------------------------------------+
|                         PERSISTENCE LAYER                               |
|   Local: SQLite (zero-setup dev.db)                                     |
|   Production: PostgreSQL + Redis (via docker-compose.yml)               |
+-------------------------------------------------------------------------+
```

---

## Tech Stack & Engineering Decisions

| Layer | Technology | Why this choice? |
| :--- | :--- | :--- |
| **Backend Runtime** | **Node.js + Express** | Non-blocking event loop ideal for concurrent WebSocket rooms and lightweight REST handlers. |
| **Real-Time Engine** | **Socket.io** | Built-in room isolation (`order:<id>`, `riders:online`), automatic reconnection, and clean auth handshake middleware. |
| **ORM & Database** | **Prisma ORM + SQLite / PostgreSQL** | Type-safe queries, declarative schema, and clean `$transaction` / `updateMany` primitives. Configured with SQLite locally for zero-dependency onboarding and PostgreSQL (`docker-compose.yml`) for production. |
| **Authentication** | **JWT + bcryptjs** | Stateless role claims (`CUSTOMER` / `RIDER`) enforced at both Express middleware and Socket.io connection handshake. |
| **Frontend** | **React + Vite + Tailwind CSS** | Single 430px mobile-first viewport with per-tab `sessionStorage` auth isolation so Customer and Rider sessions can be tested side-by-side in one browser. |
| **Catalog Source** | **DummyJSON API** | Free external product API ingested into the local database across 8 fashion categories with category-specific size variants (`S–XL`, `UK 7–10`, `38mm–42mm`). |

---

## Order Lifecycle: Finite State Machine (FSM)

In standard e-commerce, delivery is the end of the transaction. In Trybo, doorstep arrival is the **midpoint**. To prevent out-of-order requests or corrupted billing states, every order is governed by an explicit **Finite State Machine** (`backend/src/utils/fsm.js`):

```text
[SEARCHING_RIDER] ──(cancel)──► [CANCELLED]
       │
       ▼ (Rider accepts atomically)
[RIDER_ASSIGNED]  ──(cancel)──► [CANCELLED]
       │
       ▼ (Rider confirms hub pickup)
  [PICKED_UP]
       │
       ▼ (Rider arrives at address)
 [AT_DOORSTEP]
       │
       ▼ (Rider submits Customer's Handover OTP)
[TRY_IN_PROGRESS] ◄── 15:00 Server-Authoritative Timer Starts
       │
       ▼ (Customer marks Keep / Return per item)
[DECISION_SUBMITTED] ──(if 0 items returned)──► [COMPLETED]
       │
       ▼ (Rider collects returns & submits Return OTP)
  [COMPLETED]
```

Any API call attempting an illegal state jump (e.g., completing an order before verifying the Handover OTP) is rejected with `400 Bad Request`.

---

## Solving Core Backend Challenges

### 1. Concurrency-Safe Rider Dispatch
When an order is broadcast to `riders:online`, multiple riders may tap **Accept Delivery** at the same millisecond. A naive `findUnique` followed by `update` introduces a race condition. Trybo prevents double-assignment with an atomic conditional update:

```js
const result = await prisma.order.updateMany({
  where: { id: req.params.id, status: 'SEARCHING_RIDER', riderId: null },
  data: { riderId: req.user.id, status: 'RIDER_ASSIGNED' },
});
if (result.count === 0) return res.status(409).json({ error: 'Order already claimed' });
```

### 2. Dual-OTP Anti-Fraud Handshake
Handing over high-value apparel without upfront capture requires mutual verification:
* **Handover OTP (`handoverOtp`)**: Generated at order creation. The customer shares this 4-digit code at the door so the rider can prove physical handover and start the 15-minute clock.
* **Return OTP (`returnOtp`)**: Shared only *after* the customer submits their Keep/Return decision and physically hands unwanted items back to the rider.

### 3. Atomic Split-Billing Settlement
Inside `POST /api/orders/:id/decision`, updating individual `OrderItem` decisions (`KEPT` vs `RETURNED`), summing `priceAtOrder` for kept items, and transitioning the order status execute inside a single `prisma.$transaction(...)`. If the customer keeps **all** items, the system skips the return handover and transitions directly to `COMPLETED`.

### 4. Server-Authoritative Countdown Timer
Client clocks drift and browser tabs reload. Instead of running a backend `setInterval` or trusting client time, the backend persists `tryStartedAt = NOW()` and `tryDurationSeconds = 900` in the database. Both Customer and Rider clients compute remaining seconds directly against `tryStartedAt` and survive refreshes seamlessly.

---

## API & WebSocket Reference

### REST Endpoints
| Group | Method & Path | Description |
| :--- | :--- | :--- |
| **Auth** | `POST /api/auth/register` | Register as `CUSTOMER` or `RIDER` |
| **Auth** | `POST /api/auth/login` | Authenticate & receive role-scoped JWT |
| **Auth** | `GET /api/auth/me` | Hydrate current user session |
| **Catalog** | `GET /api/catalog/products` | List/filter products by category & search |
| **Catalog** | `POST /api/catalog/seed` | Re-sync fashion catalog from DummyJSON |
| **Orders** | `POST /api/orders` | Place Try & Buy order (max 6 items) |
| **Orders** | `GET /api/orders/my` | Customer's order history |
| **Orders** | `POST /api/orders/:id/cancel` | Cancel before `PICKED_UP` |
| **Orders** | `POST /api/orders/:id/decision` | Submit `KEPT` / `RETURNED` decisions & settle bill |
| **Rider** | `PATCH /api/rider/status` | Toggle rider `Online` / `Offline` |
| **Rider** | `GET /api/rider/jobs/available` | Fetch unassigned `SEARCHING_RIDER` orders |
| **Rider** | `POST /api/rider/jobs/:id/accept` | Atomically claim order |
| **Rider** | `POST /api/rider/jobs/:id/pickup` | Confirm hub pickup (`PICKED_UP`) |
| **Rider** | `POST /api/rider/jobs/:id/arrived` | Mark arrived at doorstep (`AT_DOORSTEP`) |
| **Rider** | `POST /api/rider/jobs/:id/start-try` | Verify `handoverOtp` & start 15m trial |
| **Rider** | `POST /api/rider/jobs/:id/verify-return` | Verify `returnOtp` & complete trip |

### WebSocket Events
* `ORDER_BROADCAST` $\rightarrow$ `riders:online` when a new order is placed.
* `ORDER_CLAIMED` / `ORDER_CANCELLED` $\rightarrow$ `riders:online` to remove stale jobs.
* `ORDER_UPDATED` $\rightarrow$ `order:<id>` whenever status, rider, or decisions change.

---

## Local Development Setup

### 1. Backend
```bash
cd backend
npm install
npx prisma db push
npm run seed
npm run dev
```
Runs on `http://localhost:5001`.

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```
Runs on `http://localhost:5173`.

### 3. Test the Live Customer + Rider Flow
Open `http://localhost:5173/` in **two browser tabs**:
* **Tab 1 (Shopper)**: Use **Shopper Demo** (`customer@trybo.com` / `password123`) $\rightarrow$ tap sizes to add to Try Bag $\rightarrow$ place order.
* **Tab 2 (Rider)**: Use **Rider Demo** (`rider@trybo.com` / `password123`) $\rightarrow$ accept the incoming delivery $\rightarrow$ step through pickup, arrival, Handover OTP, and Return OTP.
