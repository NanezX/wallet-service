const UNIQUE_VIOLATION_ERROR_CODE = '23505';

export function extractPostgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  if ('code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }

  if ('cause' in error) {
    return extractPostgresErrorCode((error as { cause?: unknown }).cause);
  }

  return undefined;
}

export function isPostgresUniqueViolation(error: unknown): error is { code: string } {
  return extractPostgresErrorCode(error) === UNIQUE_VIOLATION_ERROR_CODE;
}