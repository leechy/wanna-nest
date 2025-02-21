import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    try {
      return await this.prisma.user.create({
        data: createUserDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Auth token already exists');
        }
      }
      throw new BadRequestException('Failed to create user');
    }
  }

  async update(auth: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.findFirst({
      where: { auth },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid auth token');
    }

    return this.prisma.user.update({
      where: { uid: user.uid },
      data: updateUserDto,
    });
  }

  async findByAuth(auth: string) {
    console.log('findByAuth', auth);
    if (!auth) {
      throw new UnauthorizedException('Invalid auth token');
    }

    const user = await this.prisma.user.findFirst({
      where: { auth },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
