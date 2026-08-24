import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware';
import {
  ErrorCode,
  ErrorDetail,
  ErrorEnvelope,
} from '../constants/error-codes';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = resolveRequestId(request);
    response.setHeader('X-Request-Id', requestId);

    if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      exception.code === 'P2002'
    ) {
      response
        .status(HttpStatus.CONFLICT)
        .json(
          envelope(ErrorCode.CONFLICT, 'Resource already exists', requestId),
        );
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (isRecord(body) && 'checks' in body) {
        response.status(status).json(body);
        return;
      }

      if (status === 400) {
        response
          .status(status)
          .json(
            envelope(
              ErrorCode.VALIDATION_ERROR,
              'Request validation failed',
              requestId,
              extractDetails(body),
            ),
          );
        return;
      }

      const code = statusToCode(status, body);
      const message = publicMessage(status, body);
      response.status(status).json(envelope(code, message, requestId));
      return;
    }

    const isProduction = process.env.NODE_ENV === 'production';
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(
        envelope(
          ErrorCode.INTERNAL_ERROR,
          isProduction
            ? 'An unexpected error occurred'
            : exception instanceof Error
              ? exception.message
              : 'An unexpected error occurred',
          requestId,
        ),
      );
  }
}

function resolveRequestId(request: Request): string {
  const header = request.header(REQUEST_ID_HEADER);
  return header && header.trim().length > 0 ? header : 'unknown';
}

function envelope(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: ErrorDetail[],
): ErrorEnvelope {
  return {
    error: {
      code,
      message,
      ...(details && details.length > 0 ? { details } : {}),
      requestId,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractDetails(body: string | object): ErrorDetail[] | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  if (Array.isArray(body.details)) {
    return body.details as ErrorDetail[];
  }
  if (Array.isArray(body.message)) {
    return body.message.map((issue) => ({
      field: 'body',
      issue: String(issue),
    }));
  }
  return undefined;
}

function statusToCode(status: number, body: string | object): ErrorCode {
  if (isRecord(body) && typeof body.code === 'string') {
    const named = body.code;
    if ((Object.values(ErrorCode) as string[]).includes(named)) {
      return named as ErrorCode;
    }
  }

  switch (status) {
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 429:
      return ErrorCode.RATE_LIMITED;
    case 502:
    case 503:
      return ErrorCode.PROVIDER_UNAVAILABLE;
    default:
      return status >= 500
        ? ErrorCode.INTERNAL_ERROR
        : ErrorCode.VALIDATION_ERROR;
  }
}

function publicMessage(status: number, body: string | object): string {
  const isProduction = process.env.NODE_ENV === 'production';
  if (status >= 500 && isProduction) {
    return 'An unexpected error occurred';
  }
  if (typeof body === 'string' && body.length > 0) {
    return body;
  }
  if (isRecord(body) && typeof body.message === 'string') {
    return body.message;
  }
  if (status === 404) {
    return 'Resource not found';
  }
  if (status === 429) {
    return 'Too many requests';
  }
  if (status === 401) {
    return 'Unauthorized';
  }
  if (status === 403) {
    return 'Forbidden';
  }
  return 'Request failed';
}
