import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ShoppingSession, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListsService } from '../lists/lists.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AnalyticsService } from '../analytics/analytics.service';

// session ends after the list wasn't on the shopper's screen for so long
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const EXPIRE_CHECK_INTERVAL_MS = 60 * 1000;

export type SessionEndReason = 'timeout' | 'manual' | 'geofence';

@Injectable()
export class SessionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionsService.name);
  private expireTimer: NodeJS.Timeout | null = null;

  constructor(
    private prisma: PrismaService,
    private listsService: ListsService,
    private notifications: NotificationsService,
    private analytics: AnalyticsService,
  ) {}

  onModuleInit() {
    this.expireTimer = setInterval(() => {
      this.expireInactive().catch((error: Error) =>
        this.logger.error(`Failed to expire sessions: ${error.message}`),
      );
    }, EXPIRE_CHECK_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.expireTimer) {
      clearInterval(this.expireTimer);
      this.expireTimer = null;
    }
  }

  /**
   * Returns the active session of the shopper in the list
   *
   * @param {string} uid  shopper id
   * @param {string} listId  list id
   */
  async findActive(uid: string, listId: string) {
    return this.prisma.shoppingSession.findFirst({
      where: {
        listId,
        endedAt: null,
        shoppers: { some: { uid } },
      },
    });
  }

  /**
   * Called on every shopping action (cart, bought, unavailable):
   * extends the active session of the shopper or starts a new one,
   * notifying the other members that somebody is in the store
   *
   * @param {User} user  shopper
   * @param {string} listId  list id
   * @returns {ShoppingSession}  active session
   */
  async startOrContinue(
    user: User,
    listId: string,
    now = new Date(),
  ): Promise<ShoppingSession> {
    const active = await this.findActive(user.uid, listId);
    if (active) {
      await this.touch(active.sessionId, user.uid, now);
      return active;
    }

    // every shopper has an own session for now, merging shoppers
    // in the same store will be possible with the location
    const session = await this.prisma.shoppingSession.create({
      data: {
        listId,
        startedAt: now,
        shoppers: { create: { uid: user.uid, joinedAt: now, lastSeenAt: now } },
      },
    });

    const list = await this.prisma.list.findUnique({ where: { listId } });
    await this.analytics.track(
      'session.started',
      { uid: user.uid, listId, sessionId: session.sessionId },
      { cartMode: list?.cartMode },
      now,
    );

    const otherMembers = (await this.listsService.getMemberIds(listId)).filter(
      (uid) => uid !== user.uid,
    );
    await this.notifications.notifyListMembers(
      listId,
      otherMembers,
      'notifyOnItemStateUpdate',
      {
        title: list?.name ?? '',
        body: `${user.names} is shopping now`,
        data: { sessionId: session.sessionId },
      },
    );

    return session;
  }

  /**
   * The list is on the shopper's screen, so the session keeps going
   *
   * @param {string} auth  auth token
   * @param {string} listId  list id
   * @returns {boolean}  whether there was an active session to extend
   */
  async heartbeat(auth: string, listId: string, now = new Date()) {
    const user = await this.listsService.requireMember(auth, listId);
    const active = await this.findActive(user.uid, listId);
    if (!active) {
      return false;
    }
    await this.touch(active.sessionId, user.uid, now);
    return true;
  }

  private async touch(sessionId: string, uid: string, now: Date) {
    await this.prisma.sessionShopper.update({
      where: { sessionId_uid: { sessionId, uid } },
      data: { lastSeenAt: now },
    });
  }

  /**
   * Shopper ends the session with the "Done" button
   *
   * @param {string} auth  auth token
   * @param {string} listId  list id
   */
  async endByShopper(auth: string, listId: string, now = new Date()) {
    const user = await this.listsService.requireMember(auth, listId);
    const active = await this.findActive(user.uid, listId);
    if (!active) {
      return false;
    }
    await this.end(active.sessionId, 'manual', now);
    return true;
  }

  /**
   * Ends the session: everything in the cart is bought,
   * unavailable items stay in the list with their mark
   *
   * @param {string} sessionId  session id
   * @param {SessionEndReason} reason  why the session ended
   */
  async end(sessionId: string, reason: SessionEndReason, now = new Date()) {
    const { session, bought } = await this.prisma.$transaction(async (tx) => {
      const session = await tx.shoppingSession.update({
        where: { sessionId },
        data: { endedAt: now, endReason: reason },
        include: { shoppers: { select: { uid: true } } },
      });

      const { count: bought } = await tx.listItem.updateMany({
        where: {
          sessionId,
          ongoing: true,
          completed: false,
          deleted: false,
        },
        data: { ongoing: false, completed: true, completedAt: now },
      });

      return { session, bought };
    });

    await this.analytics.track(
      'session.ended',
      { listId: session.listId, sessionId },
      {
        reason,
        durationSec: Math.round(
          (now.getTime() - session.startedAt.getTime()) / 1000,
        ),
        shoppers: session.shoppers.map((s) => s.uid),
        // items left in the cart and bought by the session end
        cartBought: bought,
      },
      now,
    );

    await this.listsService.broadcastList(session.listId);
  }

  /**
   * Ends the sessions where no shopper had the list on the screen
   * for longer than the timeout
   *
   * @returns {number}  number of ended sessions
   */
  async expireInactive(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - SESSION_TIMEOUT_MS);
    const expired = await this.prisma.shoppingSession.findMany({
      where: {
        endedAt: null,
        shoppers: { none: { lastSeenAt: { gte: cutoff } } },
      },
      select: { sessionId: true },
    });

    for (const { sessionId } of expired) {
      await this.end(sessionId, 'timeout', now);
    }

    return expired.length;
  }

  /**
   * Returns the shoppers currently in the store with the list
   *
   * @param {string} listId  list id
   */
  async getActiveShopperIds(listId: string): Promise<string[]> {
    const shoppers = await this.prisma.sessionShopper.findMany({
      where: { session: { listId, endedAt: null } },
      select: { uid: true },
    });
    return [...new Set(shoppers.map((s) => s.uid))];
  }
}
