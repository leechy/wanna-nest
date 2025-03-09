import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import { type Server, type Socket } from 'socket.io';
import { UsersService } from '../users/users.service';
import { ListsService } from '../lists/lists.service';
import { ItemsService } from 'src/items/items.service';
import { OnEvent } from '@nestjs/event-emitter';
import { CreateItemDto } from 'src/items/dto/item.dto';
import { ListItem } from '@prisma/client';

type ClientMessage = any;

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
export class UpdatesGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server: Server;

  private clientToAuth = new Map<string, string>();
  private authToClients = new Map<string, Set<string>>();

  constructor(
    private usersService: UsersService,
    private listsService: ListsService,
    private itemsService: ItemsService,
  ) {}

  afterInit(server: Server) {
    console.log('Initialized!', server);
  }

  handleConnection(client: Socket) {
    client.emit('message', {
      data: 'Hello from server',
    });
    console.log('Client connected:', client.id);
  }

  handleDisconnect(client: Socket) {
    const clientId: string = client.id;
    if (clientId) {
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
  }

  @SubscribeMessage('auth')
  async handleAuth(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: ClientMessage,
  ) {
    console.log('Received auth:', this.server, client.id, message);
    client.emit('message', { name: 'received', message });

    try {
      if (message.auth && !message.names) {
        await this.authenticateClient(client, message);
      } else {
        await this.registerClient(client, message);
      }

      // Add other message handlers...
    } catch (error) {
      client.emit('error', {
        event: 'auth',
        error: error.message,
      });
    }
  }

  private storeClientAssociation(clientId: string, auth: string) {
    this.clientToAuth.set(clientId, auth);
    if (!this.authToClients.has(auth)) {
      this.authToClients.set(auth, new Set());
    }
    this.authToClients.get(auth)?.add(clientId);
    console.log('Client association:', this.clientToAuth, this.authToClients);
  }

  private async registerClient(client: Socket, message: ClientMessage) {
    const clientId: string = client.id;
    const { uid, auth, names, expo_push_token } = message;
    console.log('Registering client:', clientId, uid, auth, names);
    const newUser = await this.usersService
      .create({
        uid,
        auth,
        names,
        expo_push_token,
      })
      .catch((error) => {
        console.log('Failed to create user:', error);
        client.emit('error', {
          event: 'auth',
          error: error.message,
        });
        throw error;
      });

    // Store client association
    this.storeClientAssociation(clientId, (auth || newUser.auth) as string);

    client.emit('auth', { newUser });
  }

  private async authenticateClient(client: Socket, message: ClientMessage) {
    // Check if auth token is valid
    const { auth } = message;
    if (!auth) {
      throw new Error('Missing auth token');
    }

    const userData = await this.usersService.findByAuth(auth as string);
    if (!userData) {
      throw new Error('Invalid auth token');
    }

    const clientId: string = client.id;
    this.storeClientAssociation(clientId, auth as string);

    // Send initial data
    client.emit('auth', { userData });
  }

  @SubscribeMessage('list:create')
  async handleListCreateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: ClientMessage,
  ) {
    const clientId: string = client.id;
    const auth = this.clientToAuth.get(clientId);
    if (!auth) {
      throw new Error('Not authenticated');
    }

    try {
      const newList = await this.listsService.create(auth, message);
      this.broadcastListUpdate(newList.listId, 'created', newList);
    } catch (error) {
      console.log('Failed to handle list creation:', error.message);
      client.emit('error', {
        event: 'list:create',
        error: error.message,
      });
    }
  }

  @SubscribeMessage('list:update')
  async handleListUpdateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: ClientMessage,
  ) {
    const clientId: string = client.id;
    const auth = this.clientToAuth.get(clientId);
    if (!auth) {
      throw new Error('Not authenticated');
    }

    const listId: string = message.listId;
    try {
      const updatedList = await this.listsService.update(auth, listId, message);
      this.broadcastListUpdate(updatedList.listId, 'updated', updatedList);
    } catch (error) {
      console.log('Failed to handle list update:', error.message);
      client.emit('error', {
        event: 'list:update',
        error: error.message,
      });
    }
  }

  @SubscribeMessage('list:view')
  async handleListViewMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: ClientMessage,
  ) {
    const listId: string = message.listId;
    try {
      const listData = await this.listsService.findByShareId(listId);
      client.emit('list:view', { listData });
    } catch (error) {
      console.log('Failed to handle list view:', error.message);
      client.emit('error', {
        event: 'list:view',
        error: error.message,
      });
    }
  }

  @SubscribeMessage('list:join')
  async handleListJoinMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: ClientMessage,
  ) {
    const clientId: string = client.id;
    const auth = this.clientToAuth.get(clientId);
    if (!auth) {
      throw new Error('Not authenticated');
    }

    const shareId: string = message.shareId;
    try {
      const joinedList = await this.listsService.joinList(auth, shareId);
      // update the lists of the client
      client.emit('list:join', { joinedList });
      // send the new data to all the list clients
      this.broadcastListUpdate(joinedList.listId, 'joined', joinedList);
    } catch (error) {
      console.log('Failed to handle list join:', error.message);
      client.emit('error', {
        event: 'list:join',
        error: error.message,
      });
    }
  }

  @SubscribeMessage('list:leave')
  async handleListLeaveMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: ClientMessage,
  ) {
    const clientId: string = client.id;
    const auth = this.clientToAuth.get(clientId);
    if (!auth) {
      throw new Error('Not authenticated');
    }

    const listId: string = message.listId;
    try {
      const leftList = await this.listsService.leaveList(auth, listId);
      this.broadcastListUpdate(listId, 'left', leftList);
    } catch (error) {
      console.log('Failed to handle list leave:', error.message);
      client.emit('error', {
        event: 'list:leave',
        error: error.message,
      });
    }
  }

  @OnEvent('list.update')
  handleListUpdate(payload: { listId: string; action: string; data: any }) {
    const { listId, action, data } = payload;
    this.broadcastListUpdate(listId, action, data);
  }

  private broadcastListUpdate(listId: string, action: string, data: any) {
    // Send the list update to all the clients subscribed to it
    this.server.emit(`list:${listId}`, { action, data });
  }

  @SubscribeMessage('item:create')
  async handleItemCreateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: ClientMessage,
  ) {
    const clientId: string = client.id;
    const auth = this.clientToAuth.get(clientId);
    if (!auth) {
      throw new Error('Not authenticated');
    }

    try {
      const { listId, ...itemData } = message;

      // Create item and get updated list
      const result = await this.itemsService.createItem(auth, {
        ...itemData,
        listId,
      } as CreateItemDto);

      // Broadcast the entire updated list to all subscribers
      if (listId && typeof listId === 'string') {
        const updatedList = await this.listsService.findById(auth, listId);
        this.broadcastListUpdate(listId, 'itemCreated', updatedList);
      }

      // Send acknowledgment to the client
      client.emit('item:create', { result });
    } catch (error) {
      console.log('Failed to handle item creation:', error.message);
      client.emit('error', {
        event: 'item:create',
        error: error.message,
      });
    }
  }

  @SubscribeMessage('item:update')
  async handleItemUpdateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: ClientMessage,
  ) {
    const clientId: string = client.id;
    const auth = this.clientToAuth.get(clientId);
    if (!auth) {
      throw new Error('Not authenticated');
    }

    try {
      const { listId, listItemId, ...updateData } = message;

      // Update item
      await this.itemsService.updateListItem(
        auth,
        listItemId as string,
        updateData as Partial<ListItem>,
      );

      // Get and broadcast the entire updated list
      if (listId && typeof listId === 'string') {
        const updatedList = await this.listsService.findById(auth, listId);
        this.broadcastListUpdate(listId, 'itemUpdated', updatedList);
      }

      // Send acknowledgment to the client
      client.emit('item:update', { success: true });
    } catch (error) {
      console.log('Failed to handle item update:', error.message);
      client.emit('error', {
        event: 'item:update',
        error: error.message,
      });
    }
  }

  @SubscribeMessage('listItem:update')
  async handleListItemUpdateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: ClientMessage,
  ) {
    const clientId: string = client.id;
    const auth = this.clientToAuth.get(clientId);
    if (!auth) {
      throw new Error('Not authenticated');
    }

    try {
      const { listId, listItemId, ...updateData } = message;

      // Update list item
      if (
        listId &&
        typeof listId === 'string' &&
        listItemId &&
        typeof listItemId === 'string'
      ) {
        await this.itemsService.updateListItem(
          auth,
          listItemId,
          updateData as Partial<ListItem>,
        );

        // Get and broadcast the entire updated list
        const updatedList = await this.listsService.findById(auth, listId);
        this.broadcastListUpdate(listId, 'itemUpdated', updatedList);
      }

      // Send acknowledgment to the client
      client.emit('listItem:update', { success: true });
    } catch (error) {
      console.log('Failed to handle list item update:', error.message);
      client.emit('error', {
        event: 'listItem:update',
        error: error.message,
      });
    }
  }
}
