import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListsService } from '../lists/lists.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { AuthMessage, CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private listsService: ListsService,
    private analytics: AnalyticsService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    try {
      const user = await this.prisma.user.create({
        data: createUserDto,
      });
      await this.analytics.track('user.registered', { uid: user.uid });
      return user;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('User already exists');
        }
      }
      throw new BadRequestException('Failed to create user');
    }
  }

  /**
   * Signs the user in, registering them first when the token is new
   * and the message has the profile. Safe to repeat: the app sends it
   * on every connection and the sign-up may race with the sign-in.
   *
   * @param {AuthMessage} message  auth token, and uid + names to sign up
   */
  async signIn(message: AuthMessage) {
    const existing = await this.prisma.user.findUnique({
      where: { auth: message.auth },
    });

    if (!existing) {
      if (!message.uid || !message.names) {
        throw new NotFoundException('User not found');
      }
      try {
        await this.create({
          uid: message.uid,
          auth: message.auth,
          names: message.names,
          expo_push_token: message.expo_push_token,
        });
      } catch (error) {
        // created by the parallel message in the meantime
        const created = await this.prisma.user.findUnique({
          where: { auth: message.auth },
        });
        if (!created) {
          throw error;
        }
      }
    }

    return this.findByAuth(message.auth);
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
      invitations: await this.listsService.getInvitations(user.uid),
    };
  }
}
