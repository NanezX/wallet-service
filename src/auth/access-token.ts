import { randomUUID } from 'node:crypto';

import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { validate as isUuid } from 'uuid';

import { AccessTokenPayload } from './auth.types';

export type GeneratedAccessToken = {
  userId: string;
  token: string;
  authorizationHeader: string;
};

export type GenerateAccessTokenOptions = {
  secret: string;
  userId?: string;
  expiresIn?: SignOptions['expiresIn'];
};

export function resolveAccessTokenUserId(userId?: string): string {
  if (userId === undefined) {
    return randomUUID();
  }

  if (!isUuid(userId)) {
    throw new Error('userId must be a valid UUID');
  }

  return userId;
}

export function generateAccessToken(options: GenerateAccessTokenOptions): GeneratedAccessToken {
  const userId = resolveAccessTokenUserId(options.userId);
  const payload: AccessTokenPayload = { sub: userId };
  const token = jwt.sign(payload, options.secret, {
    expiresIn: options.expiresIn ?? '1h',
  });

  return {
    userId,
    token,
    authorizationHeader: `Bearer ${token}`,
  };
}