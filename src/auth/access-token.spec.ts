import jwt from 'jsonwebtoken';

import { generateAccessToken, resolveAccessTokenUserId } from './access-token';

describe('access token helpers', () => {
  it('signs a token for the provided user id', () => {
    const result = generateAccessToken({
      secret: 'test-secret',
      userId: '41f9cb15-fc8a-492c-b3b6-2bc1f7a52c22',
      expiresIn: '15m',
    });

    const payload = jwt.verify(result.token, 'test-secret') as { sub: string };

    expect(result.userId).toBe('41f9cb15-fc8a-492c-b3b6-2bc1f7a52c22');
    expect(result.authorizationHeader).toBe(`Bearer ${result.token}`);
    expect(payload.sub).toBe('41f9cb15-fc8a-492c-b3b6-2bc1f7a52c22');
  });

  it('generates a user id when none is provided', () => {
    const userId = resolveAccessTokenUserId();

    expect(userId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('rejects invalid user ids', () => {
    expect(() => resolveAccessTokenUserId('not-a-uuid')).toThrow('userId must be a valid UUID');
  });
});