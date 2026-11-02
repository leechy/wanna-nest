import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { type Socket } from 'socket.io';

/**
 * Sends every error of a message handler back to the client
 * as the `error` event the app is listening to
 */
@Catch()
export class WsErrorFilter extends BaseWsExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ws = host.switchToWs();
    const client = ws.getClient<Socket>();

    client.emit('error', {
      event: ws.getPattern(),
      error: WsErrorFilter.messageOf(exception),
    });
  }

  private static messageOf(exception: unknown): string {
    if (exception instanceof WsException) {
      const error = exception.getError();
      return typeof error === 'string' ? error : JSON.stringify(error);
    }
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && 'message' in response) {
        const { message } = response as { message: string | string[] };
        return Array.isArray(message) ? message.join(', ') : message;
      }
      return exception.message;
    }
    if (exception instanceof Error) {
      return exception.message;
    }
    return 'Unknown error';
  }
}
