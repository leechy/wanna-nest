import { createTestApp, TestApp } from '../test-utils/test-app';

describe('List items access', () => {
  let app: TestApp;
  let ownListId: string;
  let otherListId: string;
  let otherItemId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await app.createUser('alice');
    await app.createUser('mallory');

    ({ listId: otherListId } = await app.lists.create('alice', {
      name: 'Home',
    }));
    ({ listId: ownListId } = await app.lists.create('mallory', {
      name: 'Mine',
    }));
    ({ listItemId: otherItemId } = await app.items.createItem('alice', {
      listId: otherListId,
      name: 'Milk',
    }));
  }, 60000);

  afterAll(() => app.close());

  it('denies updating an item of a list the user is not a member of', async () => {
    await expect(
      app.items.updateListItem('mallory', otherItemId, { name: 'Hacked' }),
    ).rejects.toThrow('Access denied');
  });

  it('denies batch updates mixing lists', async () => {
    const { listItemId: ownItemId } = await app.items.createItem('mallory', {
      listId: ownListId,
      name: 'Bread',
    });

    await expect(
      app.items.updateMultipleListItems('mallory', [
        { listItemId: ownItemId, data: { completed: true } },
        { listItemId: otherItemId, data: { completed: true } },
      ]),
    ).rejects.toThrow('same list');
  });

  it('denies reading a list the user is not a member of', async () => {
    await expect(app.lists.findById('mallory', otherListId)).rejects.toThrow(
      'Access denied',
    );
  });

  it('lets the user join by the share link, once', async () => {
    const list = await app.prisma.list.findUniqueOrThrow({
      where: { listId: otherListId },
    });

    await app.lists.joinList('mallory', list.shareId);
    await app.lists.joinList('mallory', list.shareId);

    expect(await app.lists.getMemberIds(otherListId)).toEqual(
      expect.arrayContaining(['alice', 'mallory']),
    );
    expect(app.notifications.sentTo('alice')).toHaveLength(1);
    await expect(
      app.items.updateListItem('mallory', otherItemId, { name: 'Oat milk' }),
    ).resolves.toMatchObject({ name: 'Oat milk' });
  });

  it('denies access again after leaving the list', async () => {
    await app.lists.leaveList('mallory', otherListId);

    await expect(
      app.items.updateListItem('mallory', otherItemId, { name: 'Milk' }),
    ).rejects.toThrow('Access denied');
  });
});
