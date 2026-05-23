import { BadRequestException } from '@nestjs/common';

type CursorPayload = {
  ts: string;
  id: string;
};

function invalidCursor(): BadRequestException {
  return new BadRequestException({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid cursor',
    },
  });
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorPayload;

    if (typeof parsed.ts !== 'string' || parsed.ts.length === 0 || typeof parsed.id !== 'string' || parsed.id.length === 0) {
      throw invalidCursor();
    }

    return parsed;
  } catch {
    throw invalidCursor();
  }
}
