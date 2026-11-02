import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class TrackMessage {
  // "push_opened", "screen.list", ... stored as "client.<type>"
  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsOptional()
  listId?: string;

  @IsString()
  @IsOptional()
  sessionId?: string;

  @IsObject()
  @IsOptional()
  props?: Record<string, unknown>;
}
