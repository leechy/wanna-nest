import { IsString, IsBoolean, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: 'User Id is required' })
  uid: string;

  @IsString()
  @IsNotEmpty({ message: 'Names are required' })
  names: string;

  @IsString()
  @IsNotEmpty({ message: 'Auth token is required' })
  auth: string;

  @IsString()
  @IsOptional()
  expo_push_token?: string;

  @IsString()
  @IsOptional()
  device_push_token?: string;
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  names?: string;

  @IsString()
  @IsOptional()
  expo_push_token?: string;

  @IsString()
  @IsOptional()
  device_push_token?: string;

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
