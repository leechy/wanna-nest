import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateListDto, UpdateListDto } from './dto/list.dto';
import { EventsService } from '../events/events.service';

@Injectable()
export class ListsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  async create(auth: string, createListDto: CreateListDto) {
    if (!auth) {
      throw new UnauthorizedException('Missing auth token');
    }

    const user = await this.prisma.user.findFirst({
      where: { auth },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid auth token');
    }

    return this.prisma.$transaction(async (tx) => {
      const list = await tx.list.create({
        data: createListDto,
      });

      await tx.userList.create({
        data: {
          uid: user.uid,
          listId: list.listId,
        },
      });

      return list;
    });
  }

  async update(auth: string, listId: string, updateListDto: UpdateListDto) {
    const userList = await this.prisma.userList.findFirst({
      where: {
        list: { listId },
        user: { auth },
      },
    });

    if (!userList) {
      throw new UnauthorizedException('Access denied');
    }

    const { sortOrder, updatedAt, users, listItems, ...updateListData } =
      updateListDto;

    if (users || listItems) {
      console.warn(
        'Properties `users` and `listItems` should not be sent back to the server',
      );
    }

    const updatedList = this.prisma.list.update({
      where: { listId },
      data: updateListData,
    });

    // update user's list data data
    if (sortOrder || updatedAt) {
      await this.prisma.userList.update({
        where: {
          uid_listId: {
            uid: userList.uid,
            listId,
          },
        },
        data: {
          sortOrder,
        },
      });
    }

    // Select the list from the user perspective
    // and the items inside to send the update
    const list = await this.getListData(listId);

    // Notify connected clients
    this.events.emitListUpdate(listId, 'updated', list);

    return updatedList;
  }

  async findByShareId(shareId: string) {
    const list = await this.prisma.list.findFirst({
      where: { shareId },
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
    if (!auth) {
      throw new UnauthorizedException('Missing auth token');
    }

    const userList = await this.getListData(listId);

    if (!userList) {
      throw new UnauthorizedException('Access denied');
    }

    // Notify connected clients
    this.events.emitListUpdate(listId, 'updated', userList);

    return userList;
  }

  async getListData(listId: string) {
    const result = await this.prisma.userList.findFirst({
      where: {
        listId,
      },
      select: {
        listId: true,
        sortOrder: true,
        notifyOnListShared: true,
        notifyOnListItemsUpdate: true,
        notifyOnItemStateUpdate: true,
        list: {
          select: {
            listId: true,
            shareId: true,
            name: true,
            type: true,
            deadline: true,
            completed: true,
            completedAt: true,
            hideCompleted: true,
            deleted: true,
            users: {
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
                ongoing: true,
                assignee: {
                  select: {
                    names: true,
                  },
                },
                completed: true,
                completedAt: true,
                sortOrder: true,
                deleted: true,
                createdAt: true,
                updatedAt: true,
              },
            },
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    const { list, ...userList } = result;

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
      ...userList,
    };
  }

  async joinList(auth: string, shareId: string) {
    if (!auth) {
      throw new UnauthorizedException('Missing auth token');
    }

    const user = await this.prisma.user.findFirst({
      where: { auth },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid auth token');
    }

    const list = await this.prisma.list.findFirst({
      where: { shareId },
    });

    if (!list) {
      throw new NotFoundException('List not found');
    }

    const userList = this.prisma.userList.create({
      data: {
        uid: user.uid,
        listId: list.listId,
      },
    });

    return userList;
  }

  async leaveList(auth: string, listId: string) {
    if (!auth) {
      throw new UnauthorizedException('Missing auth token');
    }

    const user = await this.prisma.user.findFirst({
      where: { auth },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid auth token');
    }

    const userList = await this.prisma.userList.findFirst({
      where: {
        uid: user.uid,
        listId,
      },
    });

    if (!userList) {
      throw new NotFoundException('List not found');
    }

    await this.prisma.userList.delete({
      where: {
        uid_listId: {
          uid: user.uid,
          listId,
        },
      },
    });

    return true;
  }
}
