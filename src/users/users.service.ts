import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    try {
      return await this.prisma.user.create({
        data: createUserDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Auth token already exists');
        }
      }
      throw new BadRequestException('Failed to create user');
    }
  }

  async update(auth: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.findFirst({
      where: { auth },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid auth token');
    }

    return this.prisma.user.update({
      where: { uid: user.uid },
      data: updateUserDto,
    });
  }

  async findByAuth(auth: string) {
    if (!auth) {
      throw new UnauthorizedException('Missing auth token');
    }

    const user = await this.prisma.user.findFirst({
      where: { auth },
      select: {
        uid: true,
        names: true,
        expo_push_token: true,
        notifyOnListShared: true,
        notifyOnListItemsUpdate: true,
        notifyOnItemStateUpdate: true,
        lists: {
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
                    assignee: true,
                    completed: true,
                    sortOrder: true,
                    deleted: true,
                    updatedAt: true,
                  },
                },
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const transformedUser = {
      ...user,
      lists: user.lists.map((list) => {
        const listContents: Partial<typeof list> = {};
        if (list) {
          Object.keys(list as Record<string, unknown>).forEach(
            (key: string) => {
              if (key !== 'list') {
                listContents[key] = list[key];
              }
            },
          );
        }
        return {
          ...list.list,
          ...listContents,
          users: list.list.users
            .filter((listUser) => listUser.user.uid !== user.uid)
            .map((otherUser) => otherUser.user),
        };
      }),
    };

    return transformedUser;
  }
}
