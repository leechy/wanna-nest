import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateListDto, UpdateListDto } from './dto/list.dto';

@Injectable()
export class ListsService {
  constructor(private prisma: PrismaService) {}

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

    return this.prisma.list.update({
      where: { listId },
      data: updateListDto,
    });
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

    return this.prisma.userList.create({
      data: {
        uid: user.uid,
        listId: list.listId,
      },
    });
  }
}
