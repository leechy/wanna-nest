import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';
import { ListsController } from './lists/lists.controller';
import { ListsService } from './lists/lists.service';
import { ItemsController } from './items/items.controller';
import { ItemsService } from './items/items.service';
import { PrismaService } from './prisma/prisma.service';
import { UpdatesGateway } from './websocket/updates.gateway';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventsService } from './events/events.service';

@Module({
  imports: [EventEmitterModule.forRoot()],
  controllers: [
    AppController,
    UsersController,
    ListsController,
    ItemsController,
  ],
  providers: [
    AppService,
    UsersService,
    ListsService,
    ItemsService,
    PrismaService,
    UpdatesGateway,
    EventsService,
  ],
})
export class AppModule {}
