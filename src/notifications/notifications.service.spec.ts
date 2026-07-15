import { NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService.notifyTripAdvance', () => {
  function buildService(findManyImpl: jest.Mock, create: jest.Mock, add: jest.Mock) {
    return new NotificationsService(
      {
        user: { findMany: findManyImpl },
        notification: { create },
      } as never,
      { add } as never,
      {
        publishOrderUpdated: jest.fn(),
        publish: jest.fn(),
        publishToUser: jest.fn(),
      } as never,
    );
  }

  it('notifies merchant/ops and skips the assigned driver actor', async () => {
    const create = jest.fn().mockImplementation(async () => ({
      id: `notif-${create.mock.calls.length}`,
      type: NotificationType.ORDER_PICKED_UP,
      title: 'Parcel picked up',
      body: 'body',
      createdAt: new Date(),
    }));
    const add = jest.fn().mockResolvedValue({});
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'driver-user' }])
      .mockResolvedValueOnce([{ id: 'merchant-1' }])
      .mockResolvedValueOnce([{ id: 'ops-1' }, { id: 'driver-user' }]);

    const service = buildService(findMany, create, add);

    await service.notifyTripAdvance({
      orderId: 'order-1',
      merchantId: 'merchant-1',
      driverId: 'driver-1',
      type: NotificationType.ORDER_PICKED_UP,
      title: 'Parcel picked up',
      body: 'body',
      actorIsAssignedDriver: true,
      actorUserId: 'driver-user',
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenCalledTimes(2);
    const userIds = create.mock.calls.map(
      (call: [{ data: { userId: string } }]) => call[0].data.userId,
    );
    expect(userIds).toEqual(expect.arrayContaining(['merchant-1', 'ops-1']));
    expect(userIds).not.toContain('driver-user');
  });

  it('notifies driver + merchant + other ops when ops advances from web', async () => {
    const create = jest.fn().mockImplementation(async () => ({
      id: `notif-${create.mock.calls.length}`,
      type: NotificationType.ORDER_DELIVERED,
      title: 'Delivery completed',
      body: 'body',
      createdAt: new Date(),
    }));
    const add = jest.fn().mockResolvedValue({});
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'driver-user' }])
      .mockResolvedValueOnce([{ id: 'merchant-1' }])
      .mockResolvedValueOnce([{ id: 'ops-user' }, { id: 'ops-2' }]);

    const service = buildService(findMany, create, add);

    await service.notifyTripAdvance({
      orderId: 'order-1',
      merchantId: 'merchant-1',
      driverId: 'driver-1',
      type: NotificationType.ORDER_DELIVERED,
      title: 'Delivery completed',
      body: 'body',
      actorIsAssignedDriver: false,
      actorUserId: 'ops-user',
    });

    expect(create).toHaveBeenCalledTimes(3);
    const userIds = create.mock.calls.map(
      (call: [{ data: { userId: string } }]) => call[0].data.userId,
    );
    expect(userIds).toEqual(
      expect.arrayContaining(['driver-user', 'merchant-1', 'ops-2']),
    );
    expect(userIds).not.toContain('ops-user');
  });
});
