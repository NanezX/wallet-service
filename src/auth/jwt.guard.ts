import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';

type JwtPayload = {
  sub?: string;
};

type RequestWithAuth = {
  headers: {
    authorization?: string;
  };
  user?: {
    userId: string;
  };
};

function unauthorized(): UnauthorizedException {
  return new UnauthorizedException({
    error: {
      code: 'UNAUTHENTICATED',
      message: 'Invalid or missing bearer token',
    },
  });
}

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw unauthorized();
    }

    const token = authorization.slice('Bearer '.length);

    try {
      const payload = jwt.verify(token, this.configService.getOrThrow<string>('JWT_SECRET')) as JwtPayload | string;

      if (typeof payload === 'string' || typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw unauthorized();
      }

      request.user = { userId: payload.sub };

      return true;
    } catch {
      throw unauthorized();
    }
  }
}
