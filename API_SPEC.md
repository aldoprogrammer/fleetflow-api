# FleetFlow Orders API Specification

**Base URL:** `http://localhost:3000/v1`  
**Version:** 1.0  
**Authentication:** Merchant B2B API key (`x-api-key` header)

---

## Authentication

All order endpoints require a valid merchant API key.

| Header | Required | Description |
|--------|----------|-------------|
| `x-api-key` | Yes | Merchant API key stored in `Merchant.apiKey` |
| `Content-Type` | Yes (POST) | `application/json` |
| `Accept` | Recommended | `application/json` |

### Seed API keys (local development)

| Merchant | API Key | Balance (IDR) |
|----------|---------|---------------|
| Acme Commerce Jakarta | `ff_live_merchant_acme_7f3c9a2e` | 5,000,000 |
| Enterprise Retail Nusantara | `ff_live_merchant_enterprise_9c2a5d1b` | 12,500,000 |
| Startup Logistics ID (low balance) | `ff_live_merchant_startup_1b4d8e6f` | 25,000 |

---

## Error Response Format

All unhandled HTTP and Prisma errors return a consistent envelope:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Human-readable error description",
  "timestamp": "2026-07-11T09:30:00.000Z"
}
```

| Status | Scenario |
|--------|----------|
| `400` | Validation failure, insufficient balance, Prisma constraint errors |
| `401` | Missing or invalid `x-api-key` |
| `404` | Order not found for authenticated merchant |
| `409` | Unique constraint violation (Prisma `P2002`) |
| `500` | Unhandled server error |

---

## POST `/orders`

Creates a priced dispatch order, validates merchant balance, persists `DRAFT` → `PENDING` timeline entries, and enqueues a BullMQ `dispatch-queue` job.

### Request

```http
POST /v1/orders HTTP/1.1
Host: localhost:3000
x-api-key: ff_live_merchant_acme_7f3c9a2e
Content-Type: application/json
```

```json
{
  "vehicleTypeRequired": "CAR",
  "pickupAddress": "Jl. Thamrin No. 1, Jakarta Pusat",
  "deliveryAddress": "Jl. Sudirman No. 52, Jakarta Selatan",
  "pickupLat": -6.2,
  "pickupLng": 106.816666,
  "deliveryLat": -6.17511,
  "deliveryLng": 106.865036
}
```

### Field Validation

| Field | Type | Rules |
|-------|------|-------|
| `vehicleTypeRequired` | enum | `BIKE`, `CAR`, or `TRUCK` |
| `pickupAddress` | string | 8–240 characters, non-empty |
| `deliveryAddress` | string | 8–240 characters, non-empty |
| `pickupLat` | number | Valid latitude (`-90` to `90`) |
| `pickupLng` | number | Valid longitude (`-180` to `180`) |
| `deliveryLat` | number | Valid latitude (`-90` to `90`) |
| `deliveryLng` | number | Valid longitude (`-180` to `180`) |

### Pricing

Order price is computed server-side from vehicle type and Haversine distance between pickup and delivery coordinates:

- Base fare: BIKE `15,000` · CAR `35,000` · TRUCK `90,000` IDR
- Per-km rate: BIKE `2,500` · CAR `4,500` · TRUCK `9,000` IDR
- Minimum billable distance: `1 km`

Merchant balance must be **≥ calculated price** at creation time. Ledger debit occurs only after successful driver assignment.

### Success Response — `201 Created`

```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "merchantId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "vehicleTypeRequired": "CAR",
  "pickupAddress": "Jl. Thamrin No. 1, Jakarta Pusat",
  "deliveryAddress": "Jl. Sudirman No. 52, Jakarta Selatan",
  "pickupLat": -6.2,
  "pickupLng": 106.816666,
  "deliveryLat": -6.17511,
  "deliveryLng": 106.865036,
  "status": "PENDING",
  "price": 48250,
  "matchDistanceKm": null,
  "assignedDriver": null,
  "timeline": [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "status": "DRAFT",
      "note": "Order draft created and priced.",
      "createdAt": "2026-07-11T09:30:00.000Z"
    },
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "status": "PENDING",
      "note": "Order queued for driver matching.",
      "createdAt": "2026-07-11T09:30:01.000Z"
    }
  ],
  "createdAt": "2026-07-11T09:30:00.000Z"
}
```

### Error Scenarios

| Status | Message (example) |
|--------|-------------------|
| `401` | `Invalid or missing API key.` |
| `400` | `Insufficient merchant balance. Required 48250, available 25000.` |
| `400` | `pickupAddress must be longer than or equal to 8 characters` |
| `400` | `vehicleTypeRequired must be one of the following values: BIKE, CAR, TRUCK` |

---

## GET `/orders/:id`

Returns full order state with nested `OrderTimeline` entries. Scoped to the authenticated merchant.

### Request

```http
GET /v1/orders/3fa85f64-5717-4562-b3fc-2c963f66afa6 HTTP/1.1
Host: localhost:3000
x-api-key: ff_live_merchant_acme_7f3c9a2e
Accept: application/json
```

| Parameter | Type | Rules |
|-----------|------|-------|
| `id` | UUID v4 | Valid order identifier |

### Success Response — `200 OK`

Same shape as create response. After successful matching:

```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "ASSIGNED",
  "price": 48250,
  "matchDistanceKm": 2.14,
  "assignedDriver": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "fullName": "Alex Rivera",
    "phone": "+628123450001",
    "vehicleType": "BIKE"
  },
  "timeline": [
    { "status": "DRAFT", "note": "Order draft created and priced.", "createdAt": "..." },
    { "status": "PENDING", "note": "Order queued for driver matching.", "createdAt": "..." },
    { "status": "MATCHING", "note": "Searching for available driver within 10 km radius.", "createdAt": "..." },
    { "status": "ASSIGNED", "note": "Driver Alex Rivera assigned.", "createdAt": "..." }
  ]
}
```

### Order Status Lifecycle

```
DRAFT → PENDING → MATCHING → ASSIGNED → PICKED_UP → DELIVERED
                              ↘ CANCELLED (no driver within 10 km)
```

### Error Scenarios

| Status | Message (example) |
|--------|-------------------|
| `401` | `Invalid or missing API key.` |
| `400` | `Validation failed (uuid is expected)` |
| `404` | `Order 3fa85f64-5717-4562-b3fc-2c963f66afa6 not found.` |

---

## Dispatch Matching (Background Worker)

The `dispatch-queue` BullMQ processor executes asynchronously after order creation:

1. Sets order status to `MATCHING` and appends timeline entry
2. Queries `AVAILABLE` drivers whose `Vehicle.type` matches `vehicleTypeRequired`
3. Computes Haversine distance from driver coordinates to pickup point
4. Selects closest driver within **10 km** radius
5. On match: `ASSIGNED` order, `ON_TRIP` driver, merchant debit, driver credit (90% of price; 10% platform fee), then enqueue driver notification (`notification-queue` → Redis pub/sub)
6. On no match: `CANCELLED` order with failure timeline note

---

## Driver Notifications (JWT)

Requires permission `notifications:read` (seeded for `DRIVER_PARTNER` and ops roles via full SUPERADMIN set).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/notifications` | List inbox (`?unreadOnly=true` optional) |
| GET | `/v1/notifications/unread-count` | `{ "count": number }` |
| GET | `/v1/notifications/stream` | SSE realtime (Redis channel per user) |
| PATCH | `/v1/notifications/:id/read` | Mark one read |
| POST | `/v1/notifications/read-all` | Mark all read |

Assignment creates a row with `type: ORDER_ASSIGNED`, then BullMQ job `deliver-notification` publishes JSON to `fleetflow:notifications:user:{userId}`.

Later trip steps also notify:

| Status | Type |
|--------|------|
| ASSIGNED | `ORDER_ASSIGNED` |
| PICKED_UP | `ORDER_PICKED_UP` |
| DELIVERED | `ORDER_DELIVERED` |
| CANCELLED | `ORDER_CANCELLED` |

Recipients: assigned driver users, merchant users for that order, and ops roles (`SUPERADMIN` / `REGIONAL_MANAGER` / `HEAD_OF_WAREHOUSE` / `FLEET_OPERATOR`).

See `fleetflow-docs/DRIVER_NOTIFICATIONS.md`.

---

## Health Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/health/live` | None | Liveness probe |
| GET | `/v1/health/ready` | None | Readiness (DB + Redis) |

---

## Local Stack

| Service | Host | Port |
|---------|------|------|
| NestJS API | `localhost` or Docker `fleetflow-api` | `3000` |
| PostgreSQL | `localhost` | `5432` |
| Redis | `localhost` | `6379` |
| Next.js Dashboard | `localhost` | `3001` |

```bash
cd fleetflow-infra && docker compose up -d
cd ../fleetflow-api && npx prisma migrate deploy && npx prisma db seed
pnpm start:dev
cd ../fleetflow-web && pnpm dev
```
