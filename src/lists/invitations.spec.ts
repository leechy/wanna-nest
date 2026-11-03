import { createTestApp, pushToken, TestApp } from '../test-utils/test-app';

describe('List invitations', () => {
  let app: TestApp;
  let homeId: string;
  let partyId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await app.createUser('andrey');
    await app.createUser('masha');
    await app.createUser('stranger');

    // andrey and masha share "Home" already
    const home = await app.lists.create('andrey', { name: 'Home' });
    homeId = home.listId;
    await app.lists.joinList('masha', home.shareId);

    ({ listId: partyId } = await app.lists.create('andrey', {
      name: 'Party',
    }));
  }, 60000);

  afterAll(() => app.close());

  it('invites someone the user already shares a list with', async () => {
    const { invitation, inviteeAuth } = await app.lists.inviteToList(
      'andrey',
      partyId,
      'masha',
    );

    expect(inviteeAuth).toBe('masha');
    expect(invitation).toMatchObject({ listId: partyId, invitedBy: 'andrey' });
    expect(invitation.list.name).toBe('Party');

    const party = await app.lists.getListData(partyId);
    expect(party.invited).toEqual([{ uid: 'masha', names: 'masha' }]);

    expect(app.notifications.sentTo('masha')).toContainEqual(
      expect.objectContaining({
        to: pushToken('masha'),
        title: 'Party',
        body: 'andrey invited you to the list',
        data: { listId: partyId, action: 'invitation' },
      }),
    );
  });

  it('gives the invitee the list to look at before joining', async () => {
    const invitations = await app.lists.getInvitations('masha');

    expect(invitations).toHaveLength(1);
    expect(invitations[0]).toMatchObject({
      listId: partyId,
      invitedBy: 'andrey',
      list: { name: 'Party' },
    });
  });

  it('removes the invitation when the invitee joins', async () => {
    const party = await app.prisma.list.findUniqueOrThrow({
      where: { listId: partyId },
    });
    await app.lists.joinList('masha', party.shareId);

    expect(await app.lists.getInvitations('masha')).toEqual([]);
    const data = await app.lists.getListData(partyId);
    expect(data.invited).toEqual([]);
    expect(data.users.map((u) => u.uid).sort()).toEqual(['andrey', 'masha']);
  });

  it('does not invite members, strangers or by non-members', async () => {
    await expect(
      app.lists.inviteToList('andrey', homeId, 'masha'),
    ).rejects.toThrow('Already in the list');

    await expect(
      app.lists.inviteToList('andrey', homeId, 'stranger'),
    ).rejects.toThrow('Access denied');

    await expect(
      app.lists.inviteToList('stranger', homeId, 'andrey'),
    ).rejects.toThrow('Access denied');

    await expect(
      app.lists.inviteToList('andrey', homeId, 'andrey'),
    ).rejects.toThrow('in the list already');
  });
});
