import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Headers,
} from '@nestjs/common';
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/item.dto';
import { ListItem } from '@prisma/client';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get()
  findPublicItems() {
    return this.itemsService.findPublicItems();
  }

  @Post()
  createItem(
    @Headers('authorization') auth: string,
    @Body() createItemDto: CreateItemDto,
  ) {
    return this.itemsService.createItem(auth, createItemDto);
  }

  @Put(':itemId/:listId')
  addItemToList(
    @Headers('authorization') auth: string,
    @Param('listId') listId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.itemsService.addItemToList(auth, listId, itemId);
  }

  @Put('batch')
  updateMultiple(
    @Headers('authorization') auth: string,
    @Body() updates: Array<{ listItemId: string; data: Partial<ListItem> }>,
  ) {
    return this.itemsService.updateMultipleListItems(auth, updates);
  }
}
