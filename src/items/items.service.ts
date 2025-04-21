import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from 'src/events/events.service';
import { CreateItemDto } from './dto/item.dto';
import { filterModelProperties } from 'src/utils/model-utils';
import { Item, ListItem, Prisma } from '@prisma/client';
import { ListsService } from 'src/lists/lists.service';

@Injectable()
export class ItemsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private listsService: ListsService,
  ) {}

  /**
   * Returns a list of all Items marked as public
   *
   * @returns {Item[]}  list of public items
   */
  async findPublicItems(): Promise<Item[]> {
    return this.prisma.item.findMany({
      where: {
        public: true,
        deleted: false,
      },
    });
  }

  /**
   * Creates new item AND list item
   *
   * @param {string} auth  auth token
   * @param {object} createItemDto  item data
   * @returns {Item}  newly created item
   */
  async createItem(auth: string, createItemDto: CreateItemDto): Promise<Item> {
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

  /**
   * Add already existing item to list
   * this would create a new list item
   *
   * @param {string} auth  auth token
   * @param {string} listId  list id
   * @param {string} itemId  already existing item id
   * @returns {ListItem}  newly created list item
   */
  async addItemToList(
    auth: string,
    listId: string,
    itemId: string,
  ): Promise<ListItem> {
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

  /**
   * Updates the specified list item
   *
   * @param {string} auth  auth token
   * @param {string} listItemId  list item id
   * @param {object} updateListItemDto  list item data
   * @returns {ListItem}  updated list item
   */
  async updateListItem(
    auth: string,
    listItemId: string,
    updateListItemDto: Partial<ListItem>,
  ): Promise<ListItem> {
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
        listId: updateListItemDto.listId,
      },
    });

    if (!userList) {
      throw new UnauthorizedException('Access denied');
    }

    // @ts-expect-error: assignee is not a valid property, but can exist, and should be removed
    const { assignee, ...updateData } = updateListItemDto;
    if (assignee) {
      console.warn('Property `assignee` should not be sent back to the server');
    }

    // Update list item
    const updatedItem = await this.prisma.listItem.update({
      where: { listItemId },
      data: updateData,
    });

    const list = await this.listsService.getListData(updateListItemDto.listId);

    // Send the updated list to all subscribers
    this.events.emitListUpdate(updateListItemDto.listId, 'updated', list);

    return updatedItem;
  }

  /**
   * Update multiple list items at once
   *
   * @param {string} auth auth token
   * @param {Array<{listItemId: string, data: Partial<ListItem>}>} updates array of updates
   * @returns {Promise<ListItem[]>} array of updated items
   */
  async updateMultipleListItems(
    auth: string,
    updates: Array<{ listItemId: string; data: Partial<ListItem> }>,
  ): Promise<ListItem[]> {
    if (!auth) {
      throw new UnauthorizedException('Missing auth token');
    }

    const user = await this.prisma.user.findFirst({
      where: { auth },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid auth token');
    }

    // All updates must be for the same list to work properly
    if (updates.length === 0) {
      return [];
    }

    // Get the first item to find the list
    const firstItem = await this.prisma.listItem.findUnique({
      where: { listItemId: updates[0].listItemId },
      select: { listId: true },
    });

    if (!firstItem) {
      throw new NotFoundException('List item not found');
    }

    // Check if user has access to the list
    const userList = await this.prisma.userList.findFirst({
      where: {
        uid: user.uid,
        listId: firstItem.listId,
      },
    });

    if (!userList) {
      throw new UnauthorizedException('Access denied');
    }

    // Update all items in a transaction
    const updatedItems = await this.prisma.$transaction(
      updates.map((update) => {
        // @ts-expect-error: assignee is not a valid property, but can exist, and should be removed
        const { assignee, ...updateData } = update.data;
        if (assignee) {
          console.warn(
            'Property `assignee` should not be sent back to the server',
          );
        }

        return this.prisma.listItem.update({
          where: { listItemId: update.listItemId },
          data: updateData,
        });
      }),
    );

    // Send only one update for the list
    const list = await this.listsService.getListData(firstItem.listId);
    this.events.emitListUpdate(firstItem.listId, 'updated', list);

    return updatedItems;
  }
}
