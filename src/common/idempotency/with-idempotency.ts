import { ConflictException } from '@nestjs/common';

import { isUniqueViolation } from '../db/pg-errors';

type WithIdempotencyOptions<TRecord, TResponse> = {
  insertFn: () => Promise<TResponse>;
  lookupFn: () => Promise<TRecord | undefined>;
  matchFn: (existing: TRecord) => boolean;
  replayFn: (existing: TRecord) => TResponse;
};

export type WithIdempotencyResult<TResponse> = {
  response: TResponse;
  replayed: boolean;
};

export async function withIdempotency<TRecord, TResponse>(
  options: WithIdempotencyOptions<TRecord, TResponse>,
): Promise<WithIdempotencyResult<TResponse>> {
  try {
    const response = await options.insertFn();
    return { response, replayed: false };
  } catch (error: unknown) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const existing = await options.lookupFn();

    if (!existing) {
      throw error;
    }

    if (!options.matchFn(existing)) {
      throw new ConflictException({
        error: {
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'Idempotency key was already used with a different payload',
        },
      });
    }

    return {
      response: options.replayFn(existing),
      replayed: true,
    };
  }
}
