import jwt from 'jsonwebtoken';

export function authHeader(userId: string): { Authorization: string } {
  const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET ?? 'test-secret', {
    expiresIn: '1h',
  });

  return {
    Authorization: `Bearer ${token}`,
  };
}