import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor } from './cursor';

describe('encodeCursor / decodeCursor', () => {
  const payload = { ts: '2024-01-01T00:00:00.000Z', id: '01900000-0000-7000-8000-000000000001' };

  it('round-trips a valid payload', () => {
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it('produces a base64url string (no +, /, = chars)', () => {
    const cursor = encodeCursor(payload);
    expect(cursor).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('throws on arbitrary garbage string', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow(BadRequestException);
  });

  it('throws on valid base64url that decodes to non-object JSON', () => {
    const encoded = Buffer.from(JSON.stringify(42), 'utf8').toString('base64url');
    expect(() => decodeCursor(encoded)).toThrow(BadRequestException);
  });

  it('throws when ts is missing', () => {
    const encoded = Buffer.from(JSON.stringify({ id: 'abc' }), 'utf8').toString('base64url');
    expect(() => decodeCursor(encoded)).toThrow(BadRequestException);
  });

  it('throws when id is missing', () => {
    const encoded = Buffer.from(JSON.stringify({ ts: '2024-01-01' }), 'utf8').toString('base64url');
    expect(() => decodeCursor(encoded)).toThrow(BadRequestException);
  });

  it('throws when ts is an empty string', () => {
    const encoded = Buffer.from(JSON.stringify({ ts: '', id: 'abc' }), 'utf8').toString('base64url');
    expect(() => decodeCursor(encoded)).toThrow(BadRequestException);
  });

  it('throws when id is an empty string', () => {
    const encoded = Buffer.from(JSON.stringify({ ts: '2024-01-01', id: '' }), 'utf8').toString('base64url');
    expect(() => decodeCursor(encoded)).toThrow(BadRequestException);
  });
});
