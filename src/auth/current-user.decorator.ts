import { UnauthorizedException, createParamDecorator, ExecutionContext } from '@nestjs/common';

import { RequestWithUser } from './auth.types';

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<RequestWithUser>();
  const userId = request.user?.userId;

  if (!userId) {
    throw new UnauthorizedException({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Missing authenticated user',
      },
    });
  }

  return userId;
});
