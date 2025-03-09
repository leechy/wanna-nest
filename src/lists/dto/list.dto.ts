import {
  IsString,
  IsOptional,
  IsDate,
  IsNotEmpty,
  IsBoolean,
  IsNumber,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateListDto {
  @IsString()
  @IsOptional()
  listId?: string;

  @IsString()
  @IsOptional()
  shareId?: string;

  @IsString()
  @IsNotEmpty({ message: 'List name is required' })
  name: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  deadline?: Date;

  @IsBoolean()
  @IsOptional()
  notifyOnListShared?: boolean;

  @IsBoolean()
  @IsOptional()
  notifyOnListItemsUpdate?: boolean;

  @IsBoolean()
  @IsOptional()
  notifyOnItemStateUpdate?: boolean;
}

export class UpdateListDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  deadline?: Date;

  @IsBoolean()
  @IsOptional()
  completed?: boolean;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  completedAt?: Date;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  notifyOnListShared?: boolean;

  @IsBoolean()
  @IsOptional()
  notifyOnListItemsUpdate?: boolean;

  @IsBoolean()
  @IsOptional()
  notifyOnItemStateUpdate?: boolean;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  updatedAt?: Date;

  @IsBoolean()
  @IsOptional()
  deleted?: boolean;

  // not welcomed properties
  // that can be sent by the client
  @IsArray()
  @IsOptional()
  users?: any;

  @IsArray()
  @IsOptional()
  listItems?: any;
}
