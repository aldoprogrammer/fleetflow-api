import { NotificationsService } from './notifications.service';

describe('NotificationsService.notifyOrderAssigned', () => {
  it('creates notifications and enqueues delivery for recipients', async () => {
    const create = jest.fn().mockImplementation(async () => ({
      id: `notif-${create.mock.calls.length}`,
      type: 'ORDER_ASSIGNED',
      title: 'Driver assigned',
      body: 'body',
      createdAt: new Date('2026-07-14T00:00:00.000Z'),
    }));
    const add = jest.fn().mockResolvedValue({});
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'user-driver' }])
      .mockResolvedValueOnce([{ id: 'user-merchant' }])
      .mockResolvedValueOnce([{ id: 'user-ops' }]);

    const service = new NotificationsService(
      {
        user: { findMany },
        notification: { create },
      } as never,
      { add } as never,
    );

    await service.notifyOrderAssigned({
      orderId: 'order-1',
      merchantId: 'merchant-1',
      driverId: 'driver-1',
      driverName: 'Alex',
      pickupAddress: 'A',
      deliveryAddress: 'B',
      distanceKm: 1.25,
    });

    expect(create).toHaveBeenCalledTimes(3);
    expect(add).toHaveBeenCalledTimes(3);
  });
});
