import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateItemDto } from './dto/item.dto';
import { filterModelProperties } from 'src/utils/model-utils';
import { Prisma } from '@prisma/client';

@Injectable()
export class ItemsService {
  constructor(private prisma: PrismaService) {}

  // Get all public items
  async findPublicItems() {
    return this.prisma.item.findMany({
      where: {
        public: true,
        deleted: false,
      },
    });
  }

  // Create new item (requires auth)
  async createItem(auth: string, createItemDto: CreateItemDto) {
    if (!auth) {
      throw new UnauthorizedException('Missing auth token');
    }

    const user = await this.prisma.user.findFirst({
      where: { auth },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid auth token');
    }

    // Check if user has access to the list
    const userList = await this.prisma.userList.findFirst({
      where: {
        uid: user.uid,
        listId: createItemDto.listId,
      },
    });

    if (!userList) {
      throw new UnauthorizedException('Access denied');
    }

    // check if item already exists
    let item: Prisma.$ItemPayload['scalars'] | null = null;
    if (createItemDto.itemId) {
      item = await this.prisma.item.findFirst({
        where: {
          itemId: createItemDto.itemId,
        },
      });

      if (!item) {
        // If item does not exist, create a new item
        const itemData = filterModelProperties(createItemDto, 'Item');
        console.log('itemData', itemData);
        item = await this.prisma.item.create({
          // @ts-expect-error: Prisma type error is possible
          data: itemData,
        });
      }
    }

    // If listId is provided, create a list item too
    if (createItemDto.listId) {
      const listItemData = filterModelProperties(createItemDto, 'ListItem');
      console.log('listItemData', listItemData);
      await this.prisma.listItem.create({
        // @ts-expect-error: Prisma type error is possible
        data: {
          ...listItemData,
          itemId: item.itemId,
        },
      });
    }

    return item;
  }

  // Add item to list
  async addItemToList(auth: string, listId: string, itemId: string) {
    if (!auth) {
      throw new UnauthorizedException('Missing auth token');
    }

    const user = await this.prisma.user.findFirst({
      where: { auth },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid auth token');
    }

    // Check if user has access to the list
    const userList = await this.prisma.userList.findFirst({
      where: {
        uid: user.uid,
        listId,
      },
    });

    if (!userList) {
      throw new UnauthorizedException('Access denied');
    }

    // Check if item exists
    const item = await this.prisma.item.findFirst({
      where: {
        itemId,
        OR: [{ public: true, deleted: false }],
      },
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    // Create list item
    return this.prisma.listItem.create({
      data: {
        itemId,
        listId,
        name: item.name,
        type: item.type,
        units: item.units,
      },
    });
  }
}
