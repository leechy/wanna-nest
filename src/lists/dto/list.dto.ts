import {
  IsString,
  IsOptional,
  IsDate,
  IsNotEmpty,
  IsBoolean,
  IsNumber,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export const CART_MODES = ['cart', 'direct'] as const;

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

  @IsIn(CART_MODES)
  @IsOptional()
  cartMode?: (typeof CART_MODES)[number];

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  deadline?: Date;

  @IsBoolean()
  @IsOptional()
  hideCompleted?: boolean;

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

  @IsIn(CART_MODES)
  @IsOptional()
  cartMode?: (typeof CART_MODES)[number];

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  deadline?: Date;

  @IsBoolean()
  @IsOptional()
  hideCompleted?: boolean;

  @IsBoolean()
  @IsOptional()
  completed?: boolean;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  completedAt?: Date;

  @IsBoolean()
  @IsOptional()
  deleted?: boolean;

  // user's own list settings

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
}

// WebSocket messages

export class UpdateListMessage extends UpdateListDto {
  @IsString()
  @IsNotEmpty()
  listId: string;
}

export class ListIdMessage {
  @IsString()
  @IsNotEmpty()
  listId: string;
}

export class InviteMessage {
  @IsString()
  @IsNotEmpty()
  listId: string;

  @IsString()
  @IsNotEmpty()
  uid: string;
}

export class ShareIdMessage {
  @IsString()
  @IsNotEmpty()
  shareId: string;
}
