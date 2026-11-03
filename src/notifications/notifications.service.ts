import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;

export type NotificationPreference =
  | 'notifyOnListShared'
  | 'notifyOnListItemsUpdate'
  | 'notifyOnItemStateUpdate';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface ExpoPushMessage extends PushMessage {
  to: string;
  sound: 'default';
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private analytics: AnalyticsService,
  ) {}

  /**
   * Sends a push notification to the list members,
   * respecting their global and per list settings
   *
   * @param {string} listId  list the notification is about
   * @param {string[]} uids  members to notify
   * @param {NotificationPreference} preference  setting that allows this kind of notification
   * @param {PushMessage} message  notification content
   */
  async notifyListMembers(
    listId: string,
    uids: string[],
    preference: NotificationPreference,
    message: PushMessage,
  ): Promise<void> {
    if (uids.length === 0) {
      return;
    }

    const memberships = await this.prisma.userList.findMany({
      where: {
        listId,
        uid: { in: uids },
        deleted: false,
        [preference]: true,
        user: {
          deleted: false,
          [preference]: true,
          expo_push_token: { not: null },
        },
      },
      select: { user: { select: { expo_push_token: true } } },
    });

    const messages: ExpoPushMessage[] = memberships.map(({ user }) => ({
      to: user.expo_push_token,
      sound: 'default',
      ...message,
      data: { listId, ...message.data },
    }));

    if (messages.length > 0) {
      await this.analytics.track(
        'push.sent',
        { listId },
        { preference, recipients: messages.length, ...message.data },
      );
    }

    await this.send(messages);
  }

  /**
   * Sends a push notification to one user, respecting their global setting,
   * for the things that are not about a list they are in, like an invitation
   *
   * @param {string} uid  user to notify
   * @param {NotificationPreference} preference  setting that allows this kind of notification
   * @param {PushMessage} message  notification content
   */
  async notifyUser(
    uid: string,
    preference: NotificationPreference,
    message: PushMessage,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: {
        uid,
        deleted: false,
        [preference]: true,
        expo_push_token: { not: null },
      },
      select: { expo_push_token: true },
    });

    if (!user?.expo_push_token) {
      return;
    }

    await this.analytics.track(
      'push.sent',
      { uid },
      { preference, recipients: 1, ...message.data },
    );

    await this.send([
      { to: user.expo_push_token, sound: 'default', ...message },
    ]);
  }

  /**
   * Sends the messages to the Expo push service
   * never throws, notifications are best effort
   */
  protected async send(messages: ExpoPushMessage[]): Promise<void> {
    for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
      const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(process.env.EXPO_ACCESS_TOKEN
              ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
              : {}),
          },
          body: JSON.stringify(batch),
        });
        if (!response.ok) {
          this.logger.warn(
            `Expo push failed: ${response.status} ${await response.text()}`,
          );
        }
      } catch (error) {
        this.logger.warn(`Expo push failed: ${(error as Error).message}`);
      }
    }
  }
}
