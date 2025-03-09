import {
  IsBoolean,
  IsDate,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
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

  @IsInt()
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

  @IsInt()
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

  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  deleted?: boolean;
}
