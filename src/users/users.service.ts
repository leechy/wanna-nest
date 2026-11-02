import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListsService } from '../lists/lists.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private listsService: ListsService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    try {
      return await this.prisma.user.create({
        data: createUserDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('User already exists');
        }
      }
      throw new BadRequestException('Failed to create user');
    }
  }

  async update(auth: string, updateUserDto: UpdateUserDto) {
    const user = await this.listsService.requireUser(auth);

    return this.prisma.user.update({
      where: { uid: user.uid },
      data: updateUserDto,
      select: {
        uid: true,
        names: true,
        notifyOnListShared: true,
        notifyOnListItemsUpdate: true,
        notifyOnItemStateUpdate: true,
      },
    });
  }

  /**
   * Returns the user with all their lists
   *
   * @param {string} auth  auth token
   */
  async findByAuth(auth: string) {
    if (!auth) {
      throw new UnauthorizedException('Missing auth token');
    }

    const user = await this.prisma.user.findUnique({
      where: { auth },
      select: {
        uid: true,
        names: true,
        deleted: true,
        notifyOnListShared: true,
        notifyOnListItemsUpdate: true,
        notifyOnItemStateUpdate: true,
        lists: {
          where: { deleted: false },
          select: { listId: true },
        },
      },
    });

    if (!user || user.deleted) {
      throw new NotFoundException('User not found');
    }

    return {
      uid: user.uid,
      names: user.names,
      notifyOnListShared: user.notifyOnListShared,
      notifyOnListItemsUpdate: user.notifyOnListItemsUpdate,
      notifyOnItemStateUpdate: user.notifyOnItemStateUpdate,
      lists: await Promise.all(
        user.lists.map(({ listId }) =>
          this.listsService.getUserListData(listId, user.uid),
        ),
      ),
    };
  }
}
