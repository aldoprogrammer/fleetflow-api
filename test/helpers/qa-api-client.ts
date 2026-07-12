const API_BASE_URL = process.env.QA_API_BASE_URL ?? 'http://localhost:3000/v1';
const SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? 'FleetFlow!2026';
const MERCHANT_API_KEY =
  process.env.SEED_MERCHANT_API_KEY ?? 'ff_live_merchant_acme_7f3c9a2e';

export const SEED_PORTAL_ACCOUNTS = {
  SUPERADMIN: {
    email: 'superadmin@fleetflow.dev',
    role: 'SUPERADMIN',
  },
  REGIONAL_MANAGER: {
    email: 'regional.manager@fleetflow.dev',
    role: 'REGIONAL_MANAGER',
  },
  HEAD_OF_WAREHOUSE: {
    email: 'warehouse.head@fleetflow.dev',
    role: 'HEAD_OF_WAREHOUSE',
  },
  FLEET_OPERATOR: {
    email: 'fleet.operator@fleetflow.dev',
    role: 'FLEET_OPERATOR',
  },
  MERCHANT_ADMIN: {
    email: 'merchant.admin@acme-commerce.id',
    role: 'MERCHANT_ADMIN',
  },
  DRIVER_PARTNER: {
    email: 'driver.partner@fleetflow.dev',
    role: 'DRIVER_PARTNER',
  },
} as const;

export type SeedPortalRole = keyof typeof SEED_PORTAL_ACCOUNTS;

/** Jakarta pickup aligned with seed drivers (Alex Rivera ~1 km). */
export const JAKARTA_MATCHING_FIXTURE = {
  vehicleTypeRequired: 'BIKE' as const,
  pickupAddress: 'Jl. Thamrin No. 1, Jakarta Pusat',
  deliveryAddress: 'Jl. Sudirman No. 52, Jakarta Selatan',
  pickupLat: -6.2,
  pickupLng: 106.816666,
  deliveryLat: -6.17511,
  deliveryLng: 106.865036,
};

/** Pickup far from seed fleet — expect CANCELLED within 10 km radius. */
export const SURABAYA_NO_MATCH_FIXTURE = {
  ...JAKARTA_MATCHING_FIXTURE,
  pickupAddress: 'Jl. Pemuda No. 1, Surabaya',
  pickupLat: -7.2575,
  pickupLng: 112.7521,
};

export interface LoginResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: string;
    permissions: string[];
    merchantId?: string | null;
    driverId?: string | null;
  };
}

export interface OrderSnapshot {
  id: string;
  status: string;
  price?: number;
  merchantId?: string;
  vehicleTypeRequired: string;
  assignedDriver?: { fullName: string; vehicleType: string } | null;
  matchDistanceKm?: number | null;
  timeline: Array<{ status: string; note: string }>;
}

export interface MerchantSummary {
  id: string;
  companyName: string;
  email: string;
}

async function parseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : response.statusText;
    throw new Error(`HTTP ${response.status}: ${message}`);
  }
  return body as T;
}

export async function apiFetch(
  path: string,
  init?: RequestInit & { token?: string; apiKey?: string },
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (init?.token) {
    headers.set('Authorization', `Bearer ${init.token}`);
  }
  if (init?.apiKey) {
    headers.set('x-api-key', init.apiKey);
  }
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
}

export async function loginPortalUser(
  email = SEED_PORTAL_ACCOUNTS.MERCHANT_ADMIN.email,
  role = SEED_PORTAL_ACCOUNTS.MERCHANT_ADMIN.role,
): Promise<string> {
  const session = await loginPortalRoleByEmail(email, role);
  return session.accessToken;
}

export async function loginPortalRole(
  role: SeedPortalRole,
): Promise<LoginResult> {
  const account = SEED_PORTAL_ACCOUNTS[role];
  return loginPortalRoleByEmail(account.email, account.role);
}

export async function loginPortalRoleByEmail(
  email: string,
  role: string,
): Promise<LoginResult> {
  const response = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: SEED_PASSWORD, role }),
  });
  return parseJson<LoginResult>(response);
}

export async function fetchProfile(token: string): Promise<LoginResult['user']> {
  const response = await apiFetch('/auth/me', { token });
  return parseJson<LoginResult['user']>(response);
}

export async function listMerchants(token: string): Promise<MerchantSummary[]> {
  const response = await apiFetch('/merchants', { token });
  return parseJson<MerchantSummary[]>(response);
}

export async function createOrder(
  token: string,
  payload: typeof JAKARTA_MATCHING_FIXTURE,
): Promise<OrderSnapshot> {
  const response = await apiFetch('/orders', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  });
  return parseJson<OrderSnapshot>(response);
}

export async function createOrderWithApiKey(
  payload: typeof JAKARTA_MATCHING_FIXTURE,
  apiKey = MERCHANT_API_KEY,
): Promise<OrderSnapshot> {
  const response = await apiFetch('/orders', {
    method: 'POST',
    apiKey,
    body: JSON.stringify(payload),
  });
  return parseJson<OrderSnapshot>(response);
}

export async function getOrder(
  token: string,
  orderId: string,
): Promise<OrderSnapshot> {
  const response = await apiFetch(`/orders/${orderId}`, { token });
  return parseJson<OrderSnapshot>(response);
}

export async function pickupOrder(
  token: string,
  orderId: string,
): Promise<OrderSnapshot> {
  const response = await apiFetch(`/orders/${orderId}/pickup`, {
    method: 'POST',
    token,
  });
  return parseJson<OrderSnapshot>(response);
}

export async function deliverOrder(
  token: string,
  orderId: string,
): Promise<OrderSnapshot> {
  const response = await apiFetch(`/orders/${orderId}/deliver`, {
    method: 'POST',
    token,
  });
  return parseJson<OrderSnapshot>(response);
}

export async function waitForOrderStatus(
  token: string,
  orderId: string,
  terminalStatuses: string[],
  options?: { timeoutMs?: number; intervalMs?: number },
): Promise<OrderSnapshot> {
  const timeoutMs = options?.timeoutMs ?? 15_000;
  const intervalMs = options?.intervalMs ?? 400;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const order = await getOrder(token, orderId);
    if (terminalStatuses.includes(order.status)) {
      return order;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const last = await getOrder(token, orderId);
  throw new Error(
    `Order ${orderId} did not reach [${terminalStatuses.join(', ')}] within ${timeoutMs}ms (last status: ${last.status}).`,
  );
}

export async function expectForbidden(
  response: Response,
): Promise<void> {
  expect(response.status).toBe(403);
}
