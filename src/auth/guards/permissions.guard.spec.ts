import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS } from '@fleetflow/shared';
import { PermissionsGuard } from './permissions.guard';

function createContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };

  const guard = new PermissionsGuard(reflector as unknown as Reflector);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows requests with no required permissions', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(undefined);
    const allowed = guard.canActivate(createContext({}));
    expect(allowed).toBe(true);
  });

  it('allows JWT user with required permission', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce([PERMISSIONS.ORDERS_CREATE])
      .mockReturnValueOnce('all');

    const allowed = guard.canActivate(
      createContext({
        authMode: 'jwt',
        user: {
          permissions: [PERMISSIONS.ORDERS_CREATE, PERMISSIONS.ORDERS_READ_OWN],
        },
      }),
    );

    expect(allowed).toBe(true);
  });

  it('rejects JWT user missing permission', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce([PERMISSIONS.MERCHANTS_MANAGE])
      .mockReturnValueOnce('all');

    expect(() =>
      guard.canActivate(
        createContext({
          authMode: 'jwt',
          user: { permissions: [PERMISSIONS.ORDERS_CREATE] },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows API key only for order create/read-own permissions', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce([PERMISSIONS.ORDERS_CREATE])
      .mockReturnValueOnce('all');

    const allowed = guard.canActivate(
      createContext({
        authMode: 'api_key',
        merchant: { id: 'merchant-1' },
      }),
    );

    expect(allowed).toBe(true);
  });

  it('rejects API key for merchants manage', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce([PERMISSIONS.MERCHANTS_MANAGE])
      .mockReturnValueOnce('all');

    expect(() =>
      guard.canActivate(
        createContext({
          authMode: 'api_key',
          merchant: { id: 'merchant-1' },
        }),
      ),
    ).toThrow('API key authentication does not grant this permission.');
  });
});
