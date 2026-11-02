import { createTestApp, TestApp } from '../test-utils/test-app';

describe('Analytics events', () => {
  let app: TestApp;
  let listId: string;

  const events = () =>
    app.prisma.analyticsEvent.findMany({
      where: { listId },
      orderBy: { id: 'asc' },
    });

  const types = async () => (await events()).map((e) => e.type);

  beforeAll(async () => {
    app = await createTestApp();
    await app.createUser('masha');
    await app.createUser('andrey');
  }, 60000);

  beforeEach(async () => {
    const list = await app.lists.create('masha', { name: 'Home' });
    listId = list.listId;
    await app.lists.joinList('andrey', list.shareId);
  });

  afterAll(() => app.close());

  it('records the whole shopping trip', async () => {
    const milk = await app.items.createItem('andrey', { listId, name: 'Milk' });
    const kefir = await app.items.createItem('andrey', {
      listId,
      name: 'Kefir',
    });

    await app.items.updateListItem('masha', milk.listItemId, { ongoing: true });
    await app.items.updateListItem('masha', kefir.listItemId, {
      unavailable: true,
      unavailableNote: 'only 3.2%',
    });
    await app.items.updateListItem('andrey', kefir.listItemId, {
      unavailableReply: 'any is fine',
    });
    const grapes = await app.items.createItem('andrey', {
      listId,
      name: 'Grapes',
    });
    await app.sessions.endByShopper('masha', listId);

    expect(await types()).toEqual([
      'list.created',
      'list.joined',
      'push.sent', // andrey joined
      'item.added',
      'item.added',
      'session.started',
      'push.sent', // masha is shopping
      'item.picked',
      'push.sent', // can't find kefir
      'item.unavailable',
      'push.sent', // the reply
      'item.unavailable_replied',
      'item.added',
      'push.sent', // grapes added
      'session.ended',
    ]);

    const all = await events();
    const added = all.filter((e) => e.type === 'item.added');
    expect(JSON.parse(added[2].props)).toEqual({
      listItemId: grapes.listItemId,
      duringOthersSession: true,
    });
    expect(JSON.parse(added[0].props).duringOthersSession).toBe(false);

    const ended = all.find((e) => e.type === 'session.ended');
    expect(JSON.parse(ended.props)).toMatchObject({
      reason: 'manual',
      shoppers: ['masha'],
      cartBought: 1,
    });
    expect(ended.sessionId).toBe(
      all.find((e) => e.type === 'session.started').sessionId,
    );
  });

  it('records the cart mode switch only when it changes', async () => {
    await app.lists.update('masha', listId, { cartMode: 'cart' });
    await app.lists.update('masha', listId, { cartMode: 'direct' });

    const switches = (await events()).filter(
      (e) => e.type === 'list.cart_mode_changed',
    );
    expect(switches.map((e) => JSON.parse(e.props))).toEqual([
      { from: 'cart', to: 'direct' },
    ]);
  });

  it('accepts sane client events only', async () => {
    const now = new Date('2026-11-02T10:00:00Z');
    const track = (type: string, props?: Record<string, unknown>) =>
      app.analytics.trackClient('masha', type, { listId }, props, now);

    expect(await track('push_opened', { action: 'reply' })).toBe(true);
    expect(await track('DROP TABLE')).toBe(false);
    expect(await track('big', { text: 'x'.repeat(2000) })).toBe(false);

    // no more than 30 a minute per user
    const results: boolean[] = [];
    for (let i = 0; i < 31; i++) {
      results.push(await track('screen.list'));
    }
    expect(results.filter((r) => !r)).toHaveLength(2);

    const clientEvents = (await events()).filter((e) =>
      e.type.startsWith('client.'),
    );
    expect(clientEvents[0]).toMatchObject({
      type: 'client.push_opened',
      uid: 'masha',
    });
    expect(clientEvents).toHaveLength(30);
  });

  it('purges events older than the retention period', async () => {
    const old = new Date('2024-01-01T00:00:00Z');
    await app.analytics.track('list.created', { listId }, undefined, old);

    const purged = await app.analytics.purgeOld(new Date('2026-11-02'));

    expect(purged).toBeGreaterThanOrEqual(1);
    expect(
      await app.prisma.analyticsEvent.count({
        where: { createdAt: { lt: new Date('2025-11-02') } },
      }),
    ).toBe(0);
  });
});
