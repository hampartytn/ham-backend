import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('strips forbidden keys from metadata before insert', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const prisma = { auditLog: { create } };
    const configService = {
      get: jest.fn().mockReturnValue('password,authorization'),
    };
    const service = new AuditService(prisma as never, configService as never);

    await service.append({
      actorType: 'USER',
      actorUserId: '11111111-1111-1111-1111-111111111111',
      action: 'user.block',
      targetType: 'User',
      targetId: '22222222-2222-2222-2222-222222222222',
      metadata: {
        reason: 'abuse',
        password: 'x',
        authorization: 'Bearer y',
        aadhaar: '123412341234',
      },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'user.block',
        metadata: {
          reason: 'abuse',
          password: '[Redacted]',
          authorization: '[Redacted]',
          aadhaar: '[Redacted]',
        },
      }) as unknown,
    });
    const firstCall = create.mock.calls[0] as
      [{ data: { metadata: Record<string, unknown> } }] | undefined;
    expect(firstCall).toBeDefined();
    const metadata = firstCall![0].data.metadata;
    expect(JSON.stringify(metadata)).not.toContain('Bearer y');
    expect(JSON.stringify(metadata)).not.toContain('123412341234');
  });
});
