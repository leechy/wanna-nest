import {
  IsString,
  IsOptional,
  IsDate,
  IsNotEmpty,
  IsBoolean,
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

  @IsBoolean()
  @IsOptional()
  notifyOnListShared?: boolean;

  @IsBoolean()
  @IsOptional()
  notifyOnListItemsUpdate?: boolean;

  @IsBoolean()
  @IsOptional()
  notifyOnItemStateUpdate?: boolean;

  @IsBoolean()
  @IsOptional()
  deleted?: boolean;
}
