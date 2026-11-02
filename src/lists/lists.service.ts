import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateListDto, UpdateListDto } from './dto/list.dto';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';

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
      unavailableNote: true,
      unavailableReply: true,
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
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ListsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private notifications: NotificationsService,
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

    await this.prisma.list.update({
      where: { listId },
      data: updateListData,
    });

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

    // joining twice by the same link is fine
    if (!existing || existing.deleted) {
      await this.prisma.userList.upsert({
        where: { uid_listId: { uid: user.uid, listId: list.listId } },
        create: { uid: user.uid, listId: list.listId },
        update: { deleted: false },
      });

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

    await this.broadcastList(listId);

    return true;
  }
}
