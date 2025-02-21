import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Headers,
} from '@nestjs/common';
import { ListsService } from './lists.service';
import { CreateListDto, UpdateListDto } from './dto/list.dto';

@Controller('lists')
export class ListsController {
  constructor(private readonly listsService: ListsService) {}

  @Post()
  create(
    @Headers('authorization') auth: string,
    @Body() createListDto: CreateListDto,
  ) {
    return this.listsService.create(auth, createListDto);
  }

  @Put(':listId')
  update(
    @Headers('authorization') auth: string,
    @Param('listId') listId: string,
    @Body() updateListDto: UpdateListDto,
  ) {
    return this.listsService.update(auth, listId, updateListDto);
  }

  @Get('share/:shareId')
  findByShareId(@Param('shareId') shareId: string) {
    return this.listsService.findByShareId(shareId);
  }

  @Post('join/:shareId')
  joinList(
    @Headers('authorization') auth: string,
    @Param('shareId') shareId: string,
  ) {
    return this.listsService.joinList(auth, shareId);
  }
}
