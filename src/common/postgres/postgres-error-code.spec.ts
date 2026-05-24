import { extractPostgresErrorCode, isPostgresUniqueViolation } from './postgres-error-code';

describe('postgres error code helpers', () => {
  it('extracts a direct postgres error code', () => {
    expect(extractPostgresErrorCode({ code: '23505' })).toBe('23505');
  });

  it('extracts a postgres error code nested in cause', () => {
    expect(extractPostgresErrorCode({ cause: { cause: { code: '40P01' } } })).toBe('40P01');
  });

  it('returns undefined for values without a postgres code', () => {
    expect(extractPostgresErrorCode({ cause: { message: 'boom' } })).toBeUndefined();
    expect(extractPostgresErrorCode('boom')).toBeUndefined();
    expect(extractPostgresErrorCode(null)).toBeUndefined();
  });

  it('identifies unique violations from direct errors', () => {
    expect(isPostgresUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('identifies unique violations from wrapped errors', () => {
    expect(isPostgresUniqueViolation({ cause: { code: '23505' } })).toBe(true);
  });

  it('does not treat other postgres errors as unique violations', () => {
    expect(isPostgresUniqueViolation({ code: '40P01' })).toBe(false);
    expect(isPostgresUniqueViolation({ cause: { code: '23503' } })).toBe(false);
  });
});