import { createTestApp, TestApp } from '../test-utils/test-app';
import { UsersService } from './users.service';

describe('Sign in or up', () => {
  let app: TestApp;
  let users: UsersService;

  beforeAll(async () => {
    app = await createTestApp();
    users = new UsersService(app.prisma, app.lists, app.analytics);
  }, 60000);

  afterAll(() => app.close());

  it('signs up a new user and signs them in again with the same message', async () => {
    const message = { uid: 'u1', auth: 'a1', names: 'Masha' };

    const first = await users.signIn(message);
    const second = await users.signIn(message);

    expect(first).toMatchObject({ uid: 'u1', names: 'Masha', lists: [] });
    expect(second).toEqual(first);
    expect(await app.prisma.user.count({ where: { uid: 'u1' } })).toBe(1);
  });

  it('survives the sign-up racing with the sign-in', async () => {
    const results = await Promise.allSettled([
      users.signIn({ uid: 'u2', auth: 'a2', names: 'Andrey' }),
      users.signIn({ uid: 'u2', auth: 'a2', names: 'Andrey' }),
    ]);

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
  });

  it('does not sign in an unknown token without the profile', async () => {
    await expect(users.signIn({ auth: 'nobody' })).rejects.toThrow(
      'User not found',
    );
  });

  it('does not take over an existing uid with another token', async () => {
    await expect(
      users.signIn({ uid: 'u1', auth: 'stolen', names: 'Eve' }),
    ).rejects.toThrow();
  });
});
