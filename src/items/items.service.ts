import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Item, ListItem, Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateItemDto, UpdateListItemDto } from './dto/item.dto';
import { ListsService } from '../lists/lists.service';
import { SessionsService } from '../sessions/sessions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AnalyticsService } from '../analytics/analytics.service';

@Injectable()
export class ItemsService {
  constructor(
    private prisma: PrismaService,
    private listsService: ListsService,
    private sessions: SessionsService,
    private notifications: NotificationsService,
    private analytics: AnalyticsService,
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
   * Creates new list item, and the item in the catalog if needed
   *
   * @param {string} auth  auth token
   * @param {object} createItemDto  item data
   * @returns {ListItem}  newly created list item
   */
  async createItem(
    auth: string,
    createItemDto: CreateItemDto,
  ): Promise<ListItem> {
    const { listId } = createItemDto;
    const user = await this.listsService.requireMember(auth, listId);

    let item: Item | null = null;
    if (createItemDto.itemId) {
      item = await this.prisma.item.findUnique({
        where: { itemId: createItemDto.itemId },
      });
    }
    if (!item) {
      item = await this.prisma.item.create({
        data: {
          itemId: createItemDto.itemId,
          name: createItemDto.name,
          type: createItemDto.type,
          units: createItemDto.units,
        },
      });
    }

    const listItem = await this.prisma.listItem.create({
      data: {
        listItemId: createItemDto.listItemId,
        listId,
        itemId: item.itemId,
        name: createItemDto.name,
        type: createItemDto.type,
        units: createItemDto.units,
        quantity: createItemDto.quantity,
        deadline: createItemDto.deadline,
        addedById: user.uid,
      },
    });

    await this.announceNewItem(user, listItem);
    await this.listsService.broadcastList(listId);

    return listItem;
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
    const user = await this.listsService.requireMember(auth, listId);

    const item = await this.prisma.item.findFirst({
      where: {
        itemId,
        public: true,
        deleted: false,
      },
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    const listItem = await this.prisma.listItem.create({
      data: {
        itemId,
        listId,
        name: item.name,
        type: item.type,
        units: item.units,
        addedById: user.uid,
      },
    });

    await this.announceNewItem(user, listItem);
    await this.listsService.broadcastList(listId);

    return listItem;
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
    updateListItemDto: UpdateListItemDto,
  ): Promise<ListItem> {
    const listItem = await this.prisma.listItem.findUnique({
      where: { listItemId },
    });

    if (!listItem) {
      throw new NotFoundException('List item not found');
    }

    // the list is taken from the stored list item, never from the client
    const user = await this.listsService.requireMember(auth, listItem.listId);

    const updatedItem = await this.applyUpdate(
      user,
      listItem,
      updateListItemDto,
    );

    await this.listsService.broadcastList(listItem.listId);

    return updatedItem;
  }

  /**
   * Update multiple list items at once
   *
   * @param {string} auth auth token
   * @param {Array<{listItemId: string, data: UpdateListItemDto}>} updates array of updates
   * @returns {Promise<ListItem[]>} array of updated items
   */
  async updateMultipleListItems(
    auth: string,
    updates: Array<{ listItemId: string; data: UpdateListItemDto }>,
  ): Promise<ListItem[]> {
    if (updates.length === 0) {
      return [];
    }

    const listItemIds = [...new Set(updates.map((u) => u.listItemId))];
    const listItems = await this.prisma.listItem.findMany({
      where: { listItemId: { in: listItemIds } },
    });

    if (listItems.length !== listItemIds.length) {
      throw new NotFoundException('List item not found');
    }

    const listIds = new Set(listItems.map((li) => li.listId));
    if (listIds.size !== 1) {
      throw new BadRequestException('All items must belong to the same list');
    }
    const [listId] = listIds;

    const user = await this.listsService.requireMember(auth, listId);

    const byId = new Map(listItems.map((li) => [li.listItemId, li]));
    const updatedItems: ListItem[] = [];
    for (const update of updates) {
      const current = byId.get(update.listItemId);
      const updated = await this.applyUpdate(user, current, update.data);
      byId.set(updated.listItemId, updated);
      updatedItems.push(updated);
    }

    // Send only one update for the list
    await this.listsService.broadcastList(listId);

    return updatedItems;
  }

  /**
   * Applies the member's changes to the list item,
   * tracking the shopping session and notifying about the item state
   *
   * @param {User} user  member making the change
   * @param {ListItem} current  list item before the change
   * @param {UpdateListItemDto} update  changes
   * @returns {ListItem}  updated list item
   */
  private async applyUpdate(
    user: User,
    current: ListItem,
    update: UpdateListItemDto,
    now = new Date(),
  ): Promise<ListItem> {
    const data: Prisma.ListItemUncheckedUpdateInput = { ...update };

    const putInCart = update.ongoing === true && !current.ongoing;
    const bought = update.completed === true && !current.completed;
    const markedUnavailable =
      update.unavailable === true && !current.unavailable;

    // any of these means the user is in the store right now
    if (putInCart || bought || markedUnavailable) {
      const session = await this.sessions.startOrContinue(
        user,
        current.listId,
        now,
      );
      data.sessionId = session.sessionId;
    }

    if (bought) {
      data.completedAt = now;
      data.ongoing = false;
    }

    if (update.completed === false && current.completed) {
      data.completedAt = null;
      data.sessionId = null;
    }

    if (update.ongoing === false && current.ongoing && !bought) {
      data.sessionId = null;
    }

    // found it after all
    if ((putInCart || bought) && current.unavailable) {
      data.unavailable = false;
      data.unavailableNote = null;
      data.unavailableReply = null;
    }

    if (markedUnavailable) {
      data.ongoing = false;
      data.unavailableReply = null;
    }

    if (update.unavailable === false && current.unavailable) {
      data.unavailableNote = null;
      data.unavailableReply = null;
    }

    const updated = await this.prisma.listItem.update({
      where: { listItemId: current.listItemId },
      data,
    });

    if (markedUnavailable) {
      await this.notifyAuthorAboutUnavailable(user, updated);
    }

    const replied =
      Boolean(update.unavailableReply) &&
      update.unavailableReply !== current.unavailableReply;
    if (replied) {
      await this.notifyShoppersAboutReply(user, updated);
    }

    const event = itemEventType(current, update, {
      putInCart,
      bought,
      markedUnavailable,
      replied,
    });
    if (event) {
      await this.analytics.track(
        event,
        {
          uid: user.uid,
          listId: current.listId,
          sessionId: updated.sessionId ?? current.sessionId,
        },
        {
          listItemId: current.listItemId,
          ...(markedUnavailable && {
            hasNote: Boolean(updated.unavailableNote),
          }),
          ...((putInCart || bought) &&
            current.unavailable && { wasUnavailable: true }),
        },
        now,
      );
    }

    return updated;
  }

  private async getListName(listId: string): Promise<string> {
    const list = await this.prisma.list.findUnique({
      where: { listId },
      select: { name: true },
    });
    return list?.name ?? '';
  }

  /**
   * Somebody is in the store right now — they should know about the new item
   */
  private async announceNewItem(user: User, listItem: ListItem) {
    const shoppers = (
      await this.sessions.getActiveShopperIds(listItem.listId)
    ).filter((uid) => uid !== user.uid);

    await this.analytics.track(
      'item.added',
      { uid: user.uid, listId: listItem.listId },
      {
        listItemId: listItem.listItemId,
        // the main metric: added while somebody else is in the store
        duringOthersSession: shoppers.length > 0,
      },
    );

    if (shoppers.length === 0) {
      return;
    }

    await this.notifications.notifyListMembers(
      listItem.listId,
      shoppers,
      'notifyOnListItemsUpdate',
      {
        title: await this.getListName(listItem.listId),
        body: `${user.names} added: ${listItem.name}`,
        data: { listItemId: listItem.listItemId },
      },
    );
  }

  /**
   * The author of the item can tell the shopper what to buy instead
   */
  private async notifyAuthorAboutUnavailable(user: User, listItem: ListItem) {
    if (!listItem.addedById || listItem.addedById === user.uid) {
      return;
    }

    const note = listItem.unavailableNote
      ? ` (${listItem.unavailableNote})`
      : '';
    await this.notifications.notifyListMembers(
      listItem.listId,
      [listItem.addedById],
      'notifyOnItemStateUpdate',
      {
        title: await this.getListName(listItem.listId),
        body: `${user.names} can't find ${listItem.name}${note}`,
        data: { listItemId: listItem.listItemId, action: 'unavailable' },
      },
    );
  }

  private async notifyShoppersAboutReply(user: User, listItem: ListItem) {
    const shoppers = (
      await this.sessions.getActiveShopperIds(listItem.listId)
    ).filter((uid) => uid !== user.uid);

    await this.notifications.notifyListMembers(
      listItem.listId,
      shoppers,
      'notifyOnItemStateUpdate',
      {
        title: listItem.name,
        body: `${user.names}: ${listItem.unavailableReply}`,
        data: { listItemId: listItem.listItemId, action: 'reply' },
      },
    );
  }
}

/**
 * The analytics event for the list item change, one per update
 */
function itemEventType(
  current: ListItem,
  update: UpdateListItemDto,
  changes: {
    putInCart: boolean;
    bought: boolean;
    markedUnavailable: boolean;
    replied: boolean;
  },
): string | null {
  if (changes.putInCart) return 'item.picked';
  if (changes.bought) return 'item.bought';
  if (changes.markedUnavailable) return 'item.unavailable';
  if (changes.replied) return 'item.unavailable_replied';
  if (update.completed === false && current.completed) return 'item.unbought';
  if (update.ongoing === false && current.ongoing) return 'item.unpicked';
  if (update.deleted === true && !current.deleted) return 'item.deleted';
  return null;
}
