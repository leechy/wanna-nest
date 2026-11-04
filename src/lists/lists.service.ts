import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateListDto, UpdateListDto } from './dto/list.dto';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AnalyticsService } from '../analytics/analytics.service';

const listDataSelect = {
  listId: true,
  shareId: true,
  name: true,
  type: true,
  cartMode: true,
  deadline: true,
  completed: true,
  completedAt: true,
  hideCompleted: true,
  deleted: true,
  users: {
    where: { deleted: false },
    select: {
      user: {
        select: {
          uid: true,
          names: true,
        },
      },
    },
  },
  listItems: {
    select: {
      listItemId: true,
      itemId: true,
      name: true,
      type: true,
      units: true,
      quantity: true,
      deadline: true,
      addedById: true,
      ongoing: true,
      assignee: {
        select: {
          names: true,
        },
      },
      completed: true,
      completedAt: true,
      unavailable: true,
      unavailableAt: true,
      unavailableNote: true,
      unavailableReply: true,
      unavailableReplyAt: true,
      sessionId: true,
      sortOrder: true,
      deleted: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  sessions: {
    where: { endedAt: null },
    select: {
      sessionId: true,
      startedAt: true,
      shoppers: {
        select: {
          lastSeenAt: true,
          user: { select: { uid: true, names: true } },
        },
      },
    },
  },
  // invited and not joined yet
  invitations: {
    select: {
      user: { select: { uid: true, names: true } },
    },
  },
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ListsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private notifications: NotificationsService,
    private analytics: AnalyticsService,
  ) {}

  /**
   * Returns the user by the auth token
   *
   * @param {string} auth  auth token
   * @returns {User}  user
   */
  async requireUser(auth: string): Promise<User> {
    if (!auth) {
      throw new UnauthorizedException('Missing auth token');
    }

    const user = await this.prisma.user.findUnique({
      where: { auth },
    });

    if (!user || user.deleted) {
      throw new UnauthorizedException('Invalid auth token');
    }

    return user;
  }

  /**
   * Returns the user if they are a member of the list
   *
   * @param {string} auth  auth token
   * @param {string} listId  list id
   * @returns {User}  user
   */
  async requireMember(auth: string, listId: string): Promise<User> {
    const user = await this.requireUser(auth);

    const userList = await this.prisma.userList.findFirst({
      where: {
        uid: user.uid,
        listId,
        deleted: false,
      },
    });

    if (!userList) {
      throw new UnauthorizedException('Access denied');
    }

    return user;
  }

  /**
   * Returns the ids of the list members
   *
   * @param {string} listId  list id
   * @returns {string[]}  user ids
   */
  async getMemberIds(listId: string): Promise<string[]> {
    const members = await this.prisma.userList.findMany({
      where: { listId, deleted: false },
      select: { uid: true },
    });
    return members.map((m) => m.uid);
  }

  async create(auth: string, createListDto: CreateListDto) {
    const user = await this.requireUser(auth);

    const {
      notifyOnListShared,
      notifyOnListItemsUpdate,
      notifyOnItemStateUpdate,
      ...listData
    } = createListDto;

    const listId = await this.prisma.$transaction(async (tx) => {
      const list = await tx.list.create({
        data: listData,
      });

      await tx.userList.create({
        data: {
          uid: user.uid,
          listId: list.listId,
          notifyOnListShared,
          notifyOnListItemsUpdate,
          notifyOnItemStateUpdate,
        },
      });

      return list.listId;
    });

    await this.analytics.track(
      'list.created',
      { uid: user.uid, listId },
      { cartMode: listData.cartMode ?? 'cart' },
    );

    return this.getUserListData(listId, user.uid);
  }

  async update(auth: string, listId: string, updateListDto: UpdateListDto) {
    const user = await this.requireMember(auth, listId);

    const {
      sortOrder,
      notifyOnListShared,
      notifyOnListItemsUpdate,
      notifyOnItemStateUpdate,
      ...updateListData
    } = updateListDto;

    const before = await this.prisma.list.findUnique({ where: { listId } });

    await this.prisma.list.update({
      where: { listId },
      data: updateListData,
    });

    if (
      updateListData.cartMode &&
      updateListData.cartMode !== before?.cartMode
    ) {
      await this.analytics.track(
        'list.cart_mode_changed',
        { uid: user.uid, listId },
        { from: before?.cartMode, to: updateListData.cartMode },
      );
    }

    // update user's own list settings
    await this.prisma.userList.update({
      where: {
        uid_listId: {
          uid: user.uid,
          listId,
        },
      },
      data: {
        sortOrder,
        notifyOnListShared,
        notifyOnListItemsUpdate,
        notifyOnItemStateUpdate,
      },
    });

    await this.broadcastList(listId);

    return this.getUserListData(listId, user.uid);
  }

  async findByShareId(shareId: string) {
    const list = await this.prisma.list.findFirst({
      where: { shareId, deleted: false },
      select: {
        listId: true,
        shareId: true,
        name: true,
        type: true,
        deadline: true,
      },
    });

    if (!list) {
      throw new NotFoundException('List not found');
    }

    return list;
  }

  async findById(auth: string, listId: string) {
    const user = await this.requireMember(auth, listId);
    return this.getUserListData(listId, user.uid);
  }

  /**
   * Returns the list data shared by all the members,
   * safe to broadcast to the list room
   *
   * @param {string} listId  list id
   */
  async getListData(listId: string) {
    const list = await this.prisma.list.findUnique({
      where: { listId },
      select: listDataSelect,
    });

    if (!list) {
      throw new NotFoundException('List not found');
    }

    return {
      ...list,
      users: list.users.map((u) => u.user),
      invited: list.invitations.map((i) => i.user),
      listItems: list.listItems.map((li) => ({
        ...li,
        assignee: li.assignee?.names || null,
      })),
      sessions: list.sessions.map((s) => ({
        sessionId: s.sessionId,
        startedAt: s.startedAt,
        shoppers: s.shoppers.map((sh) => ({
          ...sh.user,
          lastSeenAt: sh.lastSeenAt,
        })),
      })),
    };
  }

  /**
   * Returns the list data together with the user's own list settings
   *
   * @param {string} listId  list id
   * @param {string} uid  user id
   */
  async getUserListData(listId: string, uid: string) {
    const [list, userList] = await Promise.all([
      this.getListData(listId),
      this.prisma.userList.findUnique({
        where: { uid_listId: { uid, listId } },
        select: {
          sortOrder: true,
          notifyOnListShared: true,
          notifyOnListItemsUpdate: true,
          notifyOnItemStateUpdate: true,
        },
      }),
    ]);

    return { ...list, ...userList };
  }

  /**
   * Sends the fresh list data to all the list members
   *
   * @param {string} listId  list id
   */
  async broadcastList(listId: string) {
    const list = await this.getListData(listId);
    this.events.emitListUpdate(listId, 'updated', list);
  }

  async joinList(auth: string, shareId: string) {
    const user = await this.requireUser(auth);

    const list = await this.prisma.list.findFirst({
      where: { shareId, deleted: false },
    });

    if (!list) {
      throw new NotFoundException('List not found');
    }

    const existing = await this.prisma.userList.findUnique({
      where: { uid_listId: { uid: user.uid, listId: list.listId } },
    });

    // an invitation is not needed any more, whichever way the user came
    await this.prisma.listInvitation.deleteMany({
      where: { uid: user.uid, listId: list.listId },
    });

    // joining twice by the same link is fine
    if (!existing || existing.deleted) {
      await this.prisma.userList.upsert({
        where: { uid_listId: { uid: user.uid, listId: list.listId } },
        create: { uid: user.uid, listId: list.listId },
        update: { deleted: false },
      });

      await this.analytics.track(
        'list.joined',
        { uid: user.uid, listId: list.listId },
        { rejoined: Boolean(existing) },
      );

      const otherMembers = (await this.getMemberIds(list.listId)).filter(
        (uid) => uid !== user.uid,
      );
      await this.notifications.notifyListMembers(
        list.listId,
        otherMembers,
        'notifyOnListShared',
        {
          title: list.name,
          body: `${user.names} joined the list`,
        },
      );
    }

    await this.broadcastList(list.listId);

    return this.getUserListData(list.listId, user.uid);
  }

  /**
   * Invites someone the user already shares another list with,
   * so the list can't be pushed on strangers by their id
   *
   * @param {string} auth  inviting member
   * @param {string} listId  list id
   * @param {string} uid  invited user id
   * @returns the invitation for the invitee and the invitee auth to deliver it
   */
  async inviteToList(auth: string, listId: string, uid: string) {
    const user = await this.requireMember(auth, listId);

    if (uid === user.uid) {
      throw new BadRequestException('You are in the list already');
    }

    const invitee = await this.prisma.user.findUnique({ where: { uid } });
    if (!invitee || invitee.deleted) {
      throw new NotFoundException('User not found');
    }

    const membership = await this.prisma.userList.findUnique({
      where: { uid_listId: { uid, listId } },
    });
    if (membership && !membership.deleted) {
      throw new BadRequestException('Already in the list');
    }

    const sharedList = await this.prisma.userList.findFirst({
      where: {
        uid,
        deleted: false,
        list: {
          deleted: false,
          users: { some: { uid: user.uid, deleted: false } },
        },
      },
    });
    if (!sharedList) {
      throw new UnauthorizedException('Access denied');
    }

    await this.prisma.listInvitation.upsert({
      where: { uid_listId: { uid, listId } },
      create: { uid, listId, invitedById: user.uid },
      update: { invitedById: user.uid },
    });

    await this.analytics.track('list.invited', { uid: user.uid, listId });

    const list = await this.getListData(listId);
    await this.notifications.notifyUser(uid, 'notifyOnListShared', {
      title: list.name,
      body: `${user.names} invited you to the list`,
      data: { listId, action: 'invitation' },
    });

    await this.broadcastList(listId);

    return {
      inviteeAuth: invitee.auth,
      invitation: {
        listId,
        invitedBy: user.names,
        createdAt: new Date(),
        list,
      },
    };
  }

  /**
   * The lists the user is invited to, with their data to look at before joining
   *
   * @param {string} uid  user id
   */
  async getInvitations(uid: string) {
    const invitations = await this.prisma.listInvitation.findMany({
      where: { uid, list: { deleted: false } },
      select: {
        listId: true,
        createdAt: true,
        invitedBy: { select: { names: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      invitations.map(async ({ listId, createdAt, invitedBy }) => ({
        listId,
        invitedBy: invitedBy.names,
        createdAt,
        list: await this.getListData(listId),
      })),
    );
  }

  async leaveList(auth: string, listId: string) {
    const user = await this.requireMember(auth, listId);

    await this.prisma.userList.update({
      where: {
        uid_listId: {
          uid: user.uid,
          listId,
        },
      },
      data: { deleted: true },
    });

    await this.analytics.track('list.left', { uid: user.uid, listId });

    await this.broadcastList(listId);

    return true;
  }
}
