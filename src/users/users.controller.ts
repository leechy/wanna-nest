import { Controller, Get, Post, Body, Put, Headers } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get('me')
  findMe(@Headers('authorization') auth: string) {
    return this.usersService.findByAuth(auth);
  }

  @Put('me')
  update(
    @Headers('authorization') auth: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(auth, updateUserDto);
  }
}
