import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';
import { ListsController } from './lists/lists.controller';
import { ListsService } from './lists/lists.service';
import { PrismaService } from './prisma/prisma.service';

@Module({
  imports: [],
  controllers: [AppController, UsersController, ListsController],
  providers: [AppService, UsersService, ListsService, PrismaService],
})
export class AppModule {}
