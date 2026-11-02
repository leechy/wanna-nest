import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import { type Server, type Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import { UsersService } from '../users/users.service';
import { ListsService } from '../lists/lists.service';
import { ItemsService } from '../items/items.service';
import { SessionsService } from '../sessions/sessions.service';
import {
  BatchUpdateListItemsMessage,
  CreateItemDto,
  UpdateListItemMessage,
} from '../items/dto/item.dto';
import {
  CreateListDto,
  ListIdMessage,
  ShareIdMessage,
  UpdateListMessage,
} from '../lists/dto/list.dto';
import { AuthMessage, UpdateUserDto } from '../users/dto/user.dto';
import { WsErrorFilter } from './ws-error.filter';
import { AnalyticsService } from '../analytics/analytics.service';
import { TrackMessage } from '../analytics/dto/analytics.dto';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  serveClient: false,
  namespace: '/',
  transports: ['polling', 'websocket'],
  allowEIO3: true,
})
// unknown properties are dropped silently, older clients send more than needed
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@UseFilters(new WsErrorFilter())
export class UpdatesGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  private server: Server;

  private clientToAuth = new Map<string, string>();
  private authToClients = new Map<string, Set<string>>();

  constructor(
    private usersService: UsersService,
    private listsService: ListsService,
    private itemsService: ItemsService,
    private sessionsService: SessionsService,
    private analytics: AnalyticsService,
  ) {}

  handleDisconnect(client: Socket) {
    const clientId: string = client.id;
    const auth = this.clientToAuth.get(clientId);
    if (auth) {
      const clients = this.authToClients.get(auth);
      clients?.delete(clientId);
      if (clients?.size === 0) {
        this.authToClients.delete(auth);
      }
    }
    this.clientToAuth.delete(clientId);
  }

  @SubscribeMessage('auth')
  async handleAuth(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: AuthMessage,
  ) {
    // signs up on the first time, the app sends uid + names every time
    const userData = await this.usersService.signIn(message);
    this.storeClientAssociation(client.id, message.auth);

    // Subscribe to the updates of the user's lists only
    await client.join(userData.lists.map((list) => this.listRoom(list.listId)));

    // Send initial data
    client.emit('auth', { userData });
  }

  @SubscribeMessage('user:update')
  async handleUserUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: UpdateUserDto,
  ) {
    const user = await this.usersService.update(
      this.requireAuth(client),
      message,
    );
    client.emit('user:update', { user });
  }

  @SubscribeMessage('list:create')
  async handleListCreateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: CreateListDto,
  ) {
    const auth = this.requireAuth(client);
    const newList = await this.listsService.create(auth, message);
    this.joinListRoom(auth, newList.listId);
    this.broadcastListUpdate(newList.listId, 'created', newList);
  }

  @SubscribeMessage('list:update')
  async handleListUpdateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: UpdateListMessage,
  ) {
    const { listId, ...update } = message;
    // the list members get the update from the service
    await this.listsService.update(this.requireAuth(client), listId, update);
  }

  @SubscribeMessage('list:view')
  async handleListViewMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: ShareIdMessage,
  ) {
    const listData = await this.listsService.findByShareId(message.shareId);
    client.emit('list:view', { listData });
  }

  @SubscribeMessage('list:join')
  async handleListJoinMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: ShareIdMessage,
  ) {
    const auth = this.requireAuth(client);
    const joinedList = await this.listsService.joinList(auth, message.shareId);
    this.joinListRoom(auth, joinedList.listId);
    client.emit('list:join', { joinedList });
  }

  @SubscribeMessage('list:leave')
  async handleListLeaveMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: ListIdMessage,
  ) {
    const auth = this.requireAuth(client);
    await this.listsService.leaveList(auth, message.listId);
    this.leaveListRoom(auth, message.listId);
    client.emit('list:leave', { listId: message.listId });
  }

  @SubscribeMessage('item:create')
  async handleItemCreateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: CreateItemDto,
  ) {
    const result = await this.itemsService.createItem(
      this.requireAuth(client),
      message,
    );
    client.emit('item:create', { result });
  }

  // the older name of the listItem:update
  @SubscribeMessage('item:update')
  async handleItemUpdateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: UpdateListItemMessage,
  ) {
    await this.updateListItem(client, message);
    client.emit('item:update', { success: true });
  }

  @SubscribeMessage('listItem:update')
  async handleListItemUpdateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: UpdateListItemMessage,
  ) {
    await this.updateListItem(client, message);
    client.emit('listItem:update', { success: true });
  }

  @SubscribeMessage('listItems:updateBatch')
  async handleListItemsBatchUpdateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: BatchUpdateListItemsMessage,
  ) {
    const result = await this.itemsService.updateMultipleListItems(
      this.requireAuth(client),
      message.updates,
    );
    client.emit('listItems:updateBatch', {
      success: true,
      count: result.length,
    });
  }

  // the list is on the shopper's screen
  @SubscribeMessage('session:heartbeat')
  async handleSessionHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: ListIdMessage,
  ) {
    const active = await this.sessionsService.heartbeat(
      this.requireAuth(client),
      message.listId,
    );
    client.emit('session:heartbeat', { listId: message.listId, active });
  }

  @SubscribeMessage('session:end')
  async handleSessionEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: ListIdMessage,
  ) {
    await this.sessionsService.endByShopper(
      this.requireAuth(client),
      message.listId,
    );
    client.emit('session:end', { listId: message.listId });
  }

  // app-side events: screens, push taps; fire and forget, no reply
  @SubscribeMessage('analytics:track')
  async handleAnalyticsTrack(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: TrackMessage,
  ) {
    const user = await this.listsService.requireUser(this.requireAuth(client));
    const { type, props, ...context } = message;
    await this.analytics.trackClient(user.uid, type, context, props);
  }

  @OnEvent('list.update')
  handleListUpdate(payload: { listId: string; action: string; data: any }) {
    const { listId, action, data } = payload;
    this.broadcastListUpdate(listId, action, data);
  }

  private async updateListItem(client: Socket, message: UpdateListItemMessage) {
    const { listItemId, ...update } = message;
    // the list members get the update from the service
    await this.itemsService.updateListItem(
      this.requireAuth(client),
      listItemId,
      update,
    );
  }

  private requireAuth(client: Socket): string {
    const auth = this.clientToAuth.get(client.id);
    if (!auth) {
      throw new WsException('Not authenticated');
    }
    return auth;
  }

  private storeClientAssociation(clientId: string, auth: string) {
    this.clientToAuth.set(clientId, auth);
    if (!this.authToClients.has(auth)) {
      this.authToClients.set(auth, new Set());
    }
    this.authToClients.get(auth)?.add(clientId);
  }

  private listRoom(listId: string) {
    return `list:${listId}`;
  }

  /**
   * Subscribes all the connected clients of the user to the list updates
   */
  private joinListRoom(auth: string, listId: string) {
    const clients = this.authToClients.get(auth);
    if (clients?.size) {
      this.server.in([...clients]).socketsJoin(this.listRoom(listId));
    }
  }

  /**
   * Unsubscribes all the connected clients of the user from the list updates
   */
  private leaveListRoom(auth: string, listId: string) {
    const clients = this.authToClients.get(auth);
    if (clients?.size) {
      this.server.in([...clients]).socketsLeave(this.listRoom(listId));
    }
  }

  private broadcastListUpdate(listId: string, action: string, data: any) {
    // Send the list update only to the clients of the list members
    this.server
      .to(this.listRoom(listId))
      .emit(`list:${listId}`, { action, data });
  }
}
