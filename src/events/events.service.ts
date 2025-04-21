import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class EventsService {
  private listUpdateTimers = new Map<string, NodeJS.Timeout>();
  private listUpdateCache = new Map<string, any>();
  private readonly DEBOUNCE_TIME = 300; // ms

  constructor(private eventEmitter: EventEmitter2) {}

  /**
   * Emit a list update event immediately
   */
  emitListUpdateImmediately(listId: string, action: string, data: any) {
    this.eventEmitter.emit('list.update', { listId, action, data });
  }

  /**
   * Emit a list update event with debouncing
   */
  emitListUpdate(listId: string, action: string, data: any) {
    // Clear existing timer if there is one
    if (this.listUpdateTimers.has(listId)) {
      clearTimeout(this.listUpdateTimers.get(listId));
    }

    // Cache the data
    this.listUpdateCache.set(listId, { action, data });

    // Set a new timer
    const timer = setTimeout(() => {
      const cachedUpdate = this.listUpdateCache.get(listId);
      if (cachedUpdate) {
        this.eventEmitter.emit('list.update', {
          listId,
          action: cachedUpdate.action,
          data: cachedUpdate.data,
        });

        // Clear cache and timer
        this.listUpdateCache.delete(listId);
        this.listUpdateTimers.delete(listId);
      }
    }, this.DEBOUNCE_TIME);

    this.listUpdateTimers.set(listId, timer);
  }

  /**
   * Force emit any pending updates for a list
   */
  flushListUpdates(listId: string) {
    if (this.listUpdateTimers.has(listId)) {
      clearTimeout(this.listUpdateTimers.get(listId));
      this.listUpdateTimers.delete(listId);

      const cachedUpdate = this.listUpdateCache.get(listId);
      if (cachedUpdate) {
        this.eventEmitter.emit('list.update', {
          listId,
          action: cachedUpdate.action,
          data: cachedUpdate.data,
        });
        this.listUpdateCache.delete(listId);
      }
    }
  }
}
