import {
  JAKARTA_MATCHING_FIXTURE,
  SURABAYA_NO_MATCH_FIXTURE,
  createOrder,
  loginPortalUser,
  loginPortalRole,
  waitForOrderStatus,
} from '../helpers/qa-api-client';

const runLiveStack = process.env.QA_RUN_LIVE_STACK === 'true';
const maybeDescribe = runLiveStack ? describe : describe.skip;

maybeDescribe('Order matching (live stack)', () => {
  let token: string;

  beforeAll(async () => {
    const session = await loginPortalRole('MERCHANT_ADMIN');
    token = session.accessToken;
  });

  it('assigns closest BIKE driver for Jakarta pickup (seed coords)', async () => {
    const created = await createOrder(token, JAKARTA_MATCHING_FIXTURE);
    expect(created.status).toBe('PENDING');

    const order = await waitForOrderStatus(token, created.id, [
      'ASSIGNED',
      'CANCELLED',
    ]);

    if (order.status === 'CANCELLED') {
      const note = order.timeline.at(-1)?.note ?? '';
      throw new Error(
        `Expected ASSIGNED but got CANCELLED: "${note}". ` +
          'Run `pnpm prisma:seed` and `node scripts/qa-reset-drivers.mjs` before live QA.',
      );
    }

    expect(order.status).toBe('ASSIGNED');
    expect(order.vehicleTypeRequired).toBe('BIKE');
    expect(order.assignedDriver?.vehicleType).toBe('BIKE');
    expect(order.assignedDriver?.fullName).toMatch(/Alex Rivera|Citra Dewi/);
    expect(order.matchDistanceKm).toBeGreaterThan(0);
    expect(order.matchDistanceKm).toBeLessThanOrEqual(10);
    expect(order.timeline.map((entry) => entry.status)).toEqual(
      expect.arrayContaining(['PENDING', 'MATCHING', 'ASSIGNED']),
    );
  });

  it('cancels when no BIKE driver within 10 km', async () => {
    const created = await createOrder(token, SURABAYA_NO_MATCH_FIXTURE);

    const order = await waitForOrderStatus(token, created.id, ['CANCELLED']);

    expect(order.status).toBe('CANCELLED');
    expect(order.timeline.at(-1)?.note).toContain(
      'No available BIKE driver found within 10km',
    );
  });
});
