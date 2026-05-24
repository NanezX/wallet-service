import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { ProblemDetailsFilter } from './problem-details.filter';

function makeHost(): { host: ArgumentsHost; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });

  const host = {
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: jest.fn().mockReturnValue({ status, json }),
    }),
  } as unknown as ArgumentsHost;

  return { host, json, status };
}

describe('ProblemDetailsFilter', () => {
  let filter: ProblemDetailsFilter;

  beforeEach(() => {
    filter = new ProblemDetailsFilter();
  });

  describe('already-formatted HttpExceptions (pass-through)', () => {
    it('passes through a 404 with { error: { code, message } }', () => {
      const { host, status, json } = makeHost();
      const body = { error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' } };

      filter.catch(new NotFoundException(body), host);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith(body);
    });

    it('passes through a 401 with { error: { code, message } }', () => {
      const { host, status, json } = makeHost();
      const body = { error: { code: 'UNAUTHENTICATED', message: 'Invalid or missing bearer token' } };

      filter.catch(new UnauthorizedException(body), host);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith(body);
    });

    it('passes through a 409 with { error: { code, message } }', () => {
      const { host, status, json } = makeHost();
      const body = { error: { code: 'ACCOUNT_ALREADY_EXISTS', message: 'Account already exists' } };

      filter.catch(new ConflictException(body), host);

      expect(status).toHaveBeenCalledWith(409);
      expect(json).toHaveBeenCalledWith(body);
    });

    it('passes through a 422 with { error: { code, message } }', () => {
      const { host, status, json } = makeHost();
      const body = { error: { code: 'INSUFFICIENT_FUNDS', message: 'Account balance is lower than requested withdrawal amount' } };

      filter.catch(new UnprocessableEntityException(body), host);

      expect(status).toHaveBeenCalledWith(422);
      expect(json).toHaveBeenCalledWith(body);
    });
  });

  describe('normalization of NestJS default shapes', () => {
    it('normalizes a ValidationPipe error (array of messages) to VALIDATION_ERROR', () => {
      const { host, status, json } = makeHost();
      const exception = new BadRequestException({
        message: ['amount must be a number'],
        error: 'Bad Request',
        statusCode: 400,
      });

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({
        error: { code: 'VALIDATION_ERROR', message: 'amount must be a number' },
      });
    });

    it('normalizes a BadRequestException with a plain string body', () => {
      const { host, status, json } = makeHost();

      filter.catch(new BadRequestException('bad input'), host);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({
        error: { code: 'VALIDATION_ERROR', message: 'bad input' },
      });
    });

    it('uses NOT_FOUND code for a plain 404', () => {
      const { host, status, json } = makeHost();

      filter.catch(new NotFoundException(), host);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({
        error: { code: 'NOT_FOUND', message: 'Not Found' },
      });
    });
  });

  describe('unknown errors', () => {
    it('returns 500 INTERNAL_ERROR for a generic Error', () => {
      const { host, status, json } = makeHost();

      filter.catch(new Error('database exploded'), host);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      });
    });

    it('returns 500 INTERNAL_ERROR for a thrown string', () => {
      const { host, status, json } = makeHost();

      filter.catch('something went wrong', host);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      });
    });
  });
});
