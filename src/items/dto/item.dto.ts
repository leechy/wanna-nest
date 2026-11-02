import {
  IsArray,
  IsBoolean,
  IsDate,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateItemDto {
  @IsString()
  @IsOptional()
  itemId?: string;

  @IsString()
  @IsOptional()
  listItemId?: string;

  @IsString()
  @IsNotEmpty({ message: 'List ID is required' })
  listId: string;

  @IsString()
  @IsNotEmpty({ message: 'Item name is required' })
  name: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  units?: string;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  deadline?: Date;

  @IsBoolean()
  @IsOptional()
  public?: boolean;
}

/**
 * The only list item properties a member can change
 */
export class UpdateListItemDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  units?: string;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  deadline?: Date;

  @IsBoolean()
  @IsOptional()
  ongoing?: boolean;

  @IsString()
  @IsOptional()
  assigneeId?: string;

  @IsBoolean()
  @IsOptional()
  completed?: boolean;

  @IsBoolean()
  @IsOptional()
  unavailable?: boolean;

  @IsString()
  @IsOptional()
  unavailableNote?: string;

  @IsString()
  @IsOptional()
  unavailableReply?: string;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  deleted?: boolean;
}

// WebSocket messages

export class UpdateListItemMessage extends UpdateListItemDto {
  @IsString()
  @IsNotEmpty()
  listItemId: string;
}

export class ListItemBatchUpdate {
  @IsString()
  @IsNotEmpty()
  listItemId: string;

  @ValidateNested()
  @Type(() => UpdateListItemDto)
  data: UpdateListItemDto;
}

export class BatchUpdateListItemsMessage {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ListItemBatchUpdate)
  updates: ListItemBatchUpdate[];
}
