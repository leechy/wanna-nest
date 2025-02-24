import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class EventsService {
  constructor(private eventEmitter: EventEmitter2) {}

  emitListUpdate(listId: string, action: string, data: any) {
    this.eventEmitter.emit('list.update', { listId, action, data });
  }
}
