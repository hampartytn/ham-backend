import {
  ArgumentsHost,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

function hostWith(json: jest.Mock, requestId = 'req-1'): ArgumentsHost {
  const response = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnValue({ json }),
  };
  const request = {
    header: (name: string) =>
      name.toLowerCase() === 'x-request-id' ? requestId : undefined,
    headers: { 'x-request-id': requestId },
  };

  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
}

describe('HttpExceptionFilter', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('maps NotFoundException to the API error envelope with requestId', () => {
    const json = jest.fn();
    const filter = new HttpExceptionFilter();
    filter.catch(new NotFoundException('missing'), hostWith(json));

    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'NOT_FOUND',
        message: 'missing',
        requestId: 'req-1',
      },
    });
  });

  it('omits stack from the body in production', () => {
    process.env.NODE_ENV = 'production';
    const json = jest.fn();
    const filter = new HttpExceptionFilter();
    const error = new Error('secret internals');
    filter.catch(error, hostWith(json));

    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId: 'req-1',
      },
    });
    expect(JSON.stringify(json.mock.calls)).not.toMatch(
      /secret internals|stack/i,
    );
  });

  it('passes through readiness check payloads', () => {
    const json = jest.fn();
    const filter = new HttpExceptionFilter();
    filter.catch(
      new ServiceUnavailableException({
        status: 'error',
        checks: { database: 'down' },
      }),
      hostWith(json),
    );

    expect(json).toHaveBeenCalledWith({
      status: 'error',
      checks: { database: 'down' },
    });
  });
});
