import {
  JAKARTA_MATCHING_FIXTURE,
  SEED_PORTAL_ACCOUNTS,
  apiFetch,
  createOrder,
  deliverOrder,
  fetchProfile,
  listMerchants,
  loginPortalRole,
  loginPortalRoleByEmail,
  pickupOrder,
  waitForOrderStatus,
} from '../helpers/qa-api-client';

const runLiveStack = process.env.QA_RUN_LIVE_STACK === 'true';
const maybeDescribe = runLiveStack ? describe : describe.skip;

maybeDescribe('Auth & RBAC (live stack)', () => {
  it('login returns permissions aligned with role', async () => {
    const session = await loginPortalRole('MERCHANT_ADMIN');

    expect(session.user.role).toBe('MERCHANT_ADMIN');
    expect(session.user.permissions).toContain('orders:create');
    expect(session.user.permissions).not.toContain('fleet:manage');
  });

  it('rejects login with wrong role for email', async () => {
    const response = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: SEED_PORTAL_ACCOUNTS.MERCHANT_ADMIN.email,
        password: process.env.SEED_USER_PASSWORD ?? 'FleetFlow!2026',
        role: 'SUPERADMIN',
      }),
    });

    expect(response.status).toBe(401);
  });

  it('/auth/me returns profile for valid JWT', async () => {
    const session = await loginPortalRole('FLEET_OPERATOR');
    const profile = await fetchProfile(session.accessToken);

    expect(profile.role).toBe('FLEET_OPERATOR');
    expect(profile.permissions).toContain('fleet:manage');
  });

  it('merchant cannot list merchants (403)', async () => {
    const token = await loginPortalRole('MERCHANT_ADMIN').then((s) => s.accessToken);
    const response = await apiFetch('/merchants', { token });
    expect(response.status).toBe(403);
  });

  it('superadmin can list merchants', async () => {
    const token = await loginPortalRole('SUPERADMIN').then((s) => s.accessToken);
    const merchants = await listMerchants(token);
    expect(merchants.length).toBeGreaterThanOrEqual(1);
    expect(merchants.some((m) => m.companyName.includes('Acme'))).toBe(true);
  });

  it('driver partner cannot create orders (403)', async () => {
    const token = await loginPortalRole('DRIVER_PARTNER').then((s) => s.accessToken);
    const response = await apiFetch('/orders', {
      method: 'POST',
      token,
      body: JSON.stringify(JAKARTA_MATCHING_FIXTURE),
    });
    expect(response.status).toBe(403);
  });
});

maybeDescribe('Merchants API (live stack)', () => {
  it('regional manager can list merchants', async () => {
    const token = await loginPortalRole('REGIONAL_MANAGER').then((s) => s.accessToken);
    const merchants = await listMerchants(token);
    expect(merchants.length).toBe(3);
  });

  it('fleet operator cannot list merchants', async () => {
    const token = await loginPortalRole('FLEET_OPERATOR').then((s) => s.accessToken);
    const response = await apiFetch('/merchants', { token });
    expect(response.status).toBe(403);
  });
});

maybeDescribe('Order settlement (live stack)', () => {
  let merchantToken: string;
  let merchantId: string;

  beforeAll(async () => {
    const session = await loginPortalRole('MERCHANT_ADMIN');
    merchantToken = session.accessToken;
    merchantId = session.user.merchantId ?? '';
    if (!merchantId) {
      throw new Error('Seed merchant admin must have merchantId.');
    }
  });

  it('debits merchant balance and assigns driver on ASSIGNED', async () => {
    const { getMerchantBalance } = await import('../helpers/qa-db');
    const balanceBefore = await getMerchantBalance(merchantId);

    const created = await createOrder(merchantToken, JAKARTA_MATCHING_FIXTURE);
    const order = await waitForOrderStatus(merchantToken, created.id, [
      'ASSIGNED',
      'CANCELLED',
    ]);

    if (order.status === 'CANCELLED') {
      throw new Error(
        'Expected ASSIGNED for settlement test. Run qa-reset-drivers and prisma:seed.',
      );
    }

    expect(order.price).toBeGreaterThan(0);
    const balanceAfter = await getMerchantBalance(merchantId);
    expect(balanceAfter).toBeCloseTo(balanceBefore - (order.price ?? 0), 0);
    expect(order.assignedDriver?.vehicleType).toBe('BIKE');
  });
});

maybeDescribe('Order trip lifecycle (live stack)', () => {
  it('driver completes ASSIGNED → PICKED_UP → DELIVERED and returns AVAILABLE', async () => {
    const merchantSession = await loginPortalRole('MERCHANT_ADMIN');
    const driverSession = await loginPortalRole('DRIVER_PARTNER');
    const driverId = driverSession.user.driverId;

    if (!driverId) {
      throw new Error('Seed driver partner must have driverId.');
    }

    const created = await createOrder(
      merchantSession.accessToken,
      JAKARTA_MATCHING_FIXTURE,
    );
    const assigned = await waitForOrderStatus(
      merchantSession.accessToken,
      created.id,
      ['ASSIGNED', 'CANCELLED'],
    );

    if (assigned.status === 'CANCELLED') {
      throw new Error(
        'Expected ASSIGNED for trip test. Run qa-reset-drivers and prisma:seed.',
      );
    }

    const { getDriverStatus } = await import('../helpers/qa-db');
    expect(await getDriverStatus(driverId)).toBe('ON_TRIP');

    const pickedUp = await pickupOrder(driverSession.accessToken, created.id);
    expect(pickedUp.status).toBe('PICKED_UP');
    expect(pickedUp.timeline.some((e) => e.status === 'PICKED_UP')).toBe(true);

    const delivered = await deliverOrder(driverSession.accessToken, created.id);
    expect(delivered.status).toBe('DELIVERED');
    expect(delivered.timeline.some((e) => e.status === 'DELIVERED')).toBe(true);
    expect(await getDriverStatus(driverId)).toBe('AVAILABLE');
  });

  it('merchant cannot advance trip status (403)', async () => {
    const merchantSession = await loginPortalRole('MERCHANT_ADMIN');
    const created = await createOrder(
      merchantSession.accessToken,
      JAKARTA_MATCHING_FIXTURE,
    );
    const assigned = await waitForOrderStatus(
      merchantSession.accessToken,
      created.id,
      ['ASSIGNED', 'CANCELLED'],
    );

    if (assigned.status === 'CANCELLED') {
      throw new Error('Expected ASSIGNED for RBAC trip test.');
    }

    const response = await apiFetch(`/orders/${created.id}/pickup`, {
      method: 'POST',
      token: merchantSession.accessToken,
    });
    expect(response.status).toBe(403);
  });
});
