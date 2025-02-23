import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UsersService } from '../users/users.service';
import { ListsService } from '../lists/lists.service';

type ClientMessage = {
  type:
    | 'auth'
    | 'register'
    | 'createList'
    | 'updateList'
    | 'createItem'
    | 'updateItem';
  payload: any;
};

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class UpdatesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private clientToAuth = new Map<string, string>();
  private authToClients = new Map<string, Set<string>>();

  constructor(
    private usersService: UsersService,
    private listsService: ListsService,
  ) {}

  handleConnection(client: Socket) {
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

  @SubscribeMessage('message')
  async handleMessage(client: Socket, message: ClientMessage) {
    try {
      switch (message.type) {
        case 'register':
          await this.registerClient(client, message);
          break;

        case 'auth':
          await this.authenticateClient(client, message);
          break;

        case 'createList':
          await this.createList(client, message.payload);
          break;

        // Add other message handlers...
      }
    } catch (error) {
      client.emit('error', {
        type: message.type,
        error: error.message,
      });
    }
  }

  private async registerClient(client: Socket, message: ClientMessage) {
    const clientId: string = client.id;
    const { uid, auth, names, expo_push_token } = message.payload;
    const newUser = await this.usersService.create({
      uid,
      auth,
      names,
      expo_push_token,
    });
    client.emit('registered', newUser);

    // Store client association
    this.storeClientAssociation(clientId, (auth || newUser.auth) as string);
  }

  private async authenticateClient(client: Socket, message: ClientMessage) {
    // Check if auth token is valid
    const { auth } = message.payload;
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
    client.emit('userData', userData);
  }

  private async createList(client: Socket, listData: any) {
    const clientId: string = client.id;
    const auth = this.clientToAuth.get(clientId);
    if (!auth) {
      throw new Error('Not authenticated');
    }

    const newList = await this.listsService.create(auth, listData);
    this.broadcastListUpdate(newList.listId, 'created', newList);
  }

  private storeClientAssociation(clientId: string, auth: string) {
    this.clientToAuth.set(clientId, auth);
    if (!this.authToClients.has(auth)) {
      this.authToClients.set(auth, new Set());
    }
    this.authToClients.get(auth)?.add(clientId);
  }

  private broadcastListUpdate(listId: string, action: string, data: any) {
    // Find all clients that should receive this update
    this.server.emit(`list:${listId}`, {
      action,
      data,
    });
  }

  // Method to be called from services when data changes
  notifyListUpdate(listId: string, action: string, data: any) {
    this.broadcastListUpdate(listId, action, data);
  }
}
