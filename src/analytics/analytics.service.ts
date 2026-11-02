import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// rows older than this are deleted, conclusions go to the spec findings
const RETENTION_DAYS = Number(process.env.ANALYTICS_RETENTION_DAYS) || 365;
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

// client events are limited so a broken client can't flood the table
const CLIENT_TYPE_PATTERN = /^[a-z][a-z0-9_.]{0,39}$/;
const CLIENT_PROPS_MAX_LENGTH = 1000;
const CLIENT_EVENTS_PER_MINUTE = 30;

export interface AnalyticsContext {
  uid?: string | null;
  listId?: string | null;
  sessionId?: string | null;
}

@Injectable()
export class AnalyticsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsService.name);
  private purgeTimer: NodeJS.Timeout | null = null;
  private clientRate = new Map<string, { minute: number; count: number }>();

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.purgeTimer = setInterval(() => {
      this.purgeOld().catch((error: Error) =>
        this.logger.error(`Failed to purge events: ${error.message}`),
      );
    }, PURGE_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.purgeTimer) {
      clearInterval(this.purgeTimer);
      this.purgeTimer = null;
    }
  }

  /**
   * Records a product event, never throws: analytics must not break the app
   *
   * @param {string} type  event type, "noun.verb"
   * @param {AnalyticsContext} context  who and where
   * @param {object} props  small event details
   */
  async track(
    type: string,
    context: AnalyticsContext,
    props?: Record<string, unknown>,
    now = new Date(),
  ): Promise<void> {
    try {
      await this.prisma.analyticsEvent.create({
        data: {
          type,
          uid: context.uid ?? null,
          listId: context.listId ?? null,
          sessionId: context.sessionId ?? null,
          props: props ? JSON.stringify(props) : null,
          createdAt: now,
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to track ${type}: ${(error as Error).message}`);
    }
  }

  /**
   * Records an event sent by the app, stored with the "client." prefix
   *
   * @returns {boolean}  whether the event was accepted
   */
  async trackClient(
    uid: string,
    type: string,
    context: Omit<AnalyticsContext, 'uid'>,
    props?: Record<string, unknown>,
    now = new Date(),
  ): Promise<boolean> {
    if (!CLIENT_TYPE_PATTERN.test(type)) {
      return false;
    }
    if (props && JSON.stringify(props).length > CLIENT_PROPS_MAX_LENGTH) {
      return false;
    }
    if (!this.withinRate(uid, now)) {
      return false;
    }
    await this.track(`client.${type}`, { ...context, uid }, props, now);
    return true;
  }

  private withinRate(uid: string, now: Date): boolean {
    const minute = Math.floor(now.getTime() / 60000);
    const rate = this.clientRate.get(uid);
    if (!rate || rate.minute !== minute) {
      // forget the users from the past minutes
      if (this.clientRate.size > 1000) {
        this.clientRate.clear();
      }
      this.clientRate.set(uid, { minute, count: 1 });
      return true;
    }
    rate.count++;
    return rate.count <= CLIENT_EVENTS_PER_MINUTE;
  }

  /**
   * Deletes the events older than the retention period
   *
   * @returns {number}  number of deleted events
   */
  async purgeOld(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * PURGE_INTERVAL_MS);
    const { count } = await this.prisma.analyticsEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return count;
  }
}
