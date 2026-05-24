import { ConflictException } from '@nestjs/common';

import { withIdempotency } from './with-idempotency';

type StoredRecord = { id: string; payload: string };
type Response = { id: string; payload: string };

function makeOptions(overrides: {
  insertFn?: () => Promise<Response>;
  lookupFn?: () => Promise<StoredRecord | undefined>;
  matchFn?: (existing: StoredRecord) => boolean;
  replayFn?: (existing: StoredRecord) => Response;
}) {
  return {
    insertFn: overrides.insertFn ?? jest.fn<Promise<Response>, []>(),
    lookupFn: overrides.lookupFn ?? jest.fn<Promise<StoredRecord | undefined>, []>(),
    matchFn: overrides.matchFn ?? jest.fn<boolean, [StoredRecord]>().mockReturnValue(true),
    replayFn: overrides.replayFn ?? jest.fn<Response, [StoredRecord]>(),
  };
}

function pgUniqueViolation(): Error & { code: string } {
  return Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
}

describe('withIdempotency', () => {
  it('returns the insert result with replayed=false when the insert succeeds', async () => {
    const record = { id: '1', payload: 'hello' };
    const options = makeOptions({
      insertFn: jest.fn().mockResolvedValue(record),
    });

    const result = await withIdempotency(options);

    expect(result).toEqual({ response: record, replayed: false });
    expect(options.lookupFn).not.toHaveBeenCalled();
  });

  it('re-throws non-unique-violation errors immediately', async () => {
    const boom = new Error('connection refused');
    const options = makeOptions({
      insertFn: jest.fn().mockRejectedValue(boom),
    });

    await expect(withIdempotency(options)).rejects.toThrow('connection refused');
    expect(options.lookupFn).not.toHaveBeenCalled();
  });

  it('re-throws the original error when lookup returns undefined after 23505', async () => {
    const violation = pgUniqueViolation();
    const options = makeOptions({
      insertFn: jest.fn().mockRejectedValue(violation),
      lookupFn: jest.fn().mockResolvedValue(undefined),
    });

    await expect(withIdempotency(options)).rejects.toBe(violation);
  });

  it('returns the existing record as a replay when lookup finds a matching record', async () => {
    const existing = { id: '42', payload: 'hello' };
    const replayed = { id: '42', payload: 'hello' };
    const options = makeOptions({
      insertFn: jest.fn().mockRejectedValue(pgUniqueViolation()),
      lookupFn: jest.fn().mockResolvedValue(existing),
      matchFn: jest.fn().mockReturnValue(true),
      replayFn: jest.fn().mockReturnValue(replayed),
    });

    const result = await withIdempotency(options);

    expect(result).toEqual({ response: replayed, replayed: true });
    expect(options.matchFn).toHaveBeenCalledWith(existing);
    expect(options.replayFn).toHaveBeenCalledWith(existing);
  });

  it('throws IDEMPOTENCY_KEY_REUSED when the existing record does not match', async () => {
    const options = makeOptions({
      insertFn: jest.fn().mockRejectedValue(pgUniqueViolation()),
      lookupFn: jest.fn().mockResolvedValue({ id: '42', payload: 'different' }),
      matchFn: jest.fn().mockReturnValue(false),
    });

    await expect(withIdempotency(options)).rejects.toThrow(ConflictException);

    try {
      await withIdempotency(options);
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      expect((e as ConflictException).getResponse()).toEqual({
        error: {
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'Idempotency key was already used with a different payload',
        },
      });
    }
  });

  it('detects a unique violation wrapped in a cause chain', async () => {
    const violation = Object.assign(new Error('outer'), {
      cause: Object.assign(new Error('inner'), { code: '23505' }),
    });
    const existing = { id: '1', payload: 'hello' };
    const replayed = { id: '1', payload: 'hello' };
    const options = makeOptions({
      insertFn: jest.fn().mockRejectedValue(violation),
      lookupFn: jest.fn().mockResolvedValue(existing),
      matchFn: jest.fn().mockReturnValue(true),
      replayFn: jest.fn().mockReturnValue(replayed),
    });

    const result = await withIdempotency(options);

    expect(result.replayed).toBe(true);
  });
});
