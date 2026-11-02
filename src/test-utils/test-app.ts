import { execFileSync } from 'child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { ListsService } from '../lists/lists.service';
import { SessionsService } from '../sessions/sessions.service';
import { ItemsService } from '../items/items.service';
import {
  ExpoPushMessage,
  NotificationsService,
} from '../notifications/notifications.service';

/**
 * Collects the push notifications instead of sending them
 */
export class FakeNotificationsService extends NotificationsService {
  sent: ExpoPushMessage[] = [];

  protected send(messages: ExpoPushMessage[]): Promise<void> {
    this.sent.push(...messages);
    return Promise.resolve();
  }

  sentTo(user: string) {
    return this.sent.filter((m) => m.to === pushToken(user));
  }
}

export const pushToken = (user: string) => `ExponentPushToken[${user}]`;

/**
 * Services wired together on a fresh SQLite database
 */
export async function createTestApp() {
  const dir = mkdtempSync(join(tmpdir(), 'wanna-test-'));
  const schema = join(dir, 'schema.prisma');
  copyFileSync(join(__dirname, '../../prisma/schema.prisma'), schema);
  execFileSync(
    'npx',
    ['prisma', 'db', 'push', '--schema', schema, '--skip-generate'],
    { stdio: 'ignore' },
  );

  const prisma = new PrismaService({
    datasourceUrl: `file:${join(dir, 'dev.db')}`,
  });
  await prisma.$connect();

  const events = {
    emitListUpdate: jest.fn(),
  } as unknown as EventsService;
  const notifications = new FakeNotificationsService(prisma);
  const lists = new ListsService(prisma, events, notifications);
  const sessions = new SessionsService(prisma, lists, notifications);
  const items = new ItemsService(prisma, lists, sessions, notifications);

  /**
   * Creates a user with a push token, auth token is the user name
   */
  const createUser = (name: string) =>
    prisma.user.create({
      data: {
        uid: name,
        auth: name,
        names: name,
        expo_push_token: pushToken(name),
      },
    });

  const close = async () => {
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  };

  return {
    prisma,
    events,
    notifications,
    lists,
    sessions,
    items,
    createUser,
    close,
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
