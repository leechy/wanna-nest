import { createTestApp, TestApp } from '../test-utils/test-app';
import { SESSION_TIMEOUT_MS } from './sessions.service';

const minutes = (n: number) => n * 60 * 1000;

describe('Shopping trip', () => {
  let app: TestApp;
  let listId: string;

  const addItem = (user: string, name: string) =>
    app.items.createItem(user, { listId, name });

  const activeSessions = () =>
    app.prisma.shoppingSession.findMany({
      where: { listId, endedAt: null },
      include: { shoppers: true },
    });

  beforeAll(async () => {
    app = await createTestApp();
    await app.createUser('masha');
    await app.createUser('andrey');
    await app.createUser('kid');
  }, 60000);

  beforeEach(async () => {
    const list = await app.lists.create('masha', { name: 'Home' });
    listId = list.listId;
    await app.lists.joinList('andrey', list.shareId);
    await app.lists.joinList('kid', list.shareId);
    app.notifications.sent = [];
  });

  afterAll(() => app.close());

  it('starts a session with the first item in the cart and tells the others', async () => {
    const milk = await addItem('andrey', 'Milk');
    const bread = await addItem('andrey', 'Bread');

    await app.items.updateListItem('masha', milk.listItemId, { ongoing: true });
    await app.items.updateListItem('masha', bread.listItemId, {
      ongoing: true,
    });

    const sessions = await activeSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].shoppers.map((s) => s.uid)).toEqual(['masha']);

    // one notification per session, not per item
    expect(app.notifications.sentTo('andrey')).toHaveLength(1);
    expect(app.notifications.sentTo('andrey')[0].body).toBe(
      'masha is shopping now',
    );
    expect(app.notifications.sentTo('masha')).toHaveLength(0);
  });

  it('tells the shopper about items added during the session', async () => {
    const milk = await addItem('andrey', 'Milk');
    await app.items.updateListItem('masha', milk.listItemId, { ongoing: true });
    app.notifications.sent = [];

    await addItem('andrey', 'Grapes');

    expect(app.notifications.sentTo('masha')).toEqual([
      expect.objectContaining({ body: 'andrey added: Grapes' }),
    ]);
    // the kid is at home, not in the store
    expect(app.notifications.sentTo('kid')).toHaveLength(0);
  });

  it('does not notify anyone about new items when nobody is shopping', async () => {
    await addItem('andrey', 'Milk');

    expect(app.notifications.sent).toHaveLength(0);
  });

  it('asks the author when an item is unavailable and sends the reply back', async () => {
    const milk = await addItem('andrey', 'Milk');

    await app.items.updateListItem('masha', milk.listItemId, {
      unavailable: true,
      unavailableNote: 'only 1.5%',
    });
    expect(app.notifications.sentTo('andrey')).toContainEqual(
      expect.objectContaining({ body: "masha can't find Milk (only 1.5%)" }),
    );

    await app.items.updateListItem('andrey', milk.listItemId, {
      unavailableReply: 'take any',
    });
    expect(app.notifications.sentTo('masha')).toContainEqual(
      expect.objectContaining({ body: 'andrey: take any' }),
    );
  });

  it('respects the per list notification settings', async () => {
    await app.lists.update('andrey', listId, {
      notifyOnItemStateUpdate: false,
    });
    const milk = await addItem('kid', 'Milk');

    await app.items.updateListItem('masha', milk.listItemId, { ongoing: true });

    expect(app.notifications.sentTo('andrey')).toHaveLength(0);
    expect(app.notifications.sentTo('kid')).toHaveLength(1);
  });

  it('buys the cart when the list was not on the screen for 30 minutes', async () => {
    const start = new Date();
    const milk = await addItem('andrey', 'Milk');
    await addItem('andrey', 'Bread');
    const cheese = await addItem('andrey', 'Cheese');

    await app.items.updateListItem('masha', milk.listItemId, { ongoing: true });
    await app.items.updateListItem('masha', cheese.listItemId, {
      unavailable: true,
    });
    const [session] = await activeSessions();
    await app.prisma.sessionShopper.updateMany({
      where: { sessionId: session.sessionId },
      data: { lastSeenAt: start },
    });

    const sessionState = () =>
      app.prisma.shoppingSession.findUniqueOrThrow({
        where: { sessionId: session.sessionId },
      });

    // the list is still on the screen
    await app.sessions.heartbeat(
      'masha',
      listId,
      new Date(+start + minutes(20)),
    );
    await app.sessions.expireInactive(
      new Date(+start + SESSION_TIMEOUT_MS + minutes(1)),
    );
    expect(await sessionState()).toMatchObject({ endedAt: null });

    // the phone went to the pocket
    await app.sessions.expireInactive(
      new Date(+start + minutes(20) + SESSION_TIMEOUT_MS + minutes(1)),
    );
    expect(await sessionState()).toMatchObject({ endReason: 'timeout' });

    const items = await app.prisma.listItem.findMany({ where: { listId } });
    const byName = Object.fromEntries(items.map((i) => [i.name, i]));
    expect(byName.Milk).toMatchObject({ completed: true, ongoing: false });
    expect(byName.Bread).toMatchObject({ completed: false, sessionId: null });
    expect(byName.Cheese).toMatchObject({
      completed: false,
      unavailable: true,
    });
  });

  it('gives every shopper an own session for now', async () => {
    const milk = await addItem('kid', 'Milk');
    const bread = await addItem('kid', 'Bread');

    await app.items.updateListItem('masha', milk.listItemId, { ongoing: true });
    await app.items.updateListItem('andrey', bread.listItemId, {
      ongoing: true,
    });

    expect(await activeSessions()).toHaveLength(2);
  });

  it('ends the session with the Done button', async () => {
    const milk = await addItem('andrey', 'Milk');
    await app.items.updateListItem('masha', milk.listItemId, { ongoing: true });

    expect(await app.sessions.endByShopper('masha', listId)).toBe(true);

    expect(await activeSessions()).toHaveLength(0);
    expect(
      await app.prisma.listItem.findUniqueOrThrow({
        where: { listItemId: milk.listItemId },
      }),
    ).toMatchObject({ completed: true });
  });

  it('shows the active sessions in the list data', async () => {
    const milk = await addItem('andrey', 'Milk');
    await app.items.updateListItem('masha', milk.listItemId, { ongoing: true });

    const list = await app.lists.getListData(listId);

    expect(list.sessions).toEqual([
      expect.objectContaining({
        shoppers: [expect.objectContaining({ uid: 'masha', names: 'masha' })],
      }),
    ]);
  });
});
