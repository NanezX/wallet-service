function extractErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  if ('code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }

  if ('cause' in error) {
    return extractErrorCode((error as { cause?: unknown }).cause);
  }

  return undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  return extractErrorCode(error) === '23505';
}
