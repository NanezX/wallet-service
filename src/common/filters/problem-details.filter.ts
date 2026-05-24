import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';

type ErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

function isAlreadyFormatted(body: unknown): body is ErrorBody {
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return false;
  }

  const inner = (body as { error: unknown }).error;

  return (
    typeof inner === 'object' &&
    inner !== null &&
    'code' in inner &&
    typeof (inner as { code: unknown }).code === 'string' &&
    'message' in inner &&
    typeof (inner as { message: unknown }).message === 'string'
  );
}

const HTTP_STATUS_TO_CODE: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
};

function statusToCode(status: number): string {
  return HTTP_STATUS_TO_CODE[status] ?? 'INTERNAL_ERROR';
}

function extractMessage(body: unknown): string {
  if (typeof body === 'string') {
    return body;
  }

  if (typeof body === 'object' && body !== null) {
    const raw = (body as Record<string, unknown>).message;

    if (Array.isArray(raw) && raw.length > 0) {
      return String(raw[0]);
    }

    if (typeof raw === 'string' && raw.length > 0) {
      return raw;
    }
  }

  return 'An error occurred';
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{ status(code: number): { json(body: unknown): void } }>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (isAlreadyFormatted(body)) {
        response.status(status).json(body);
        return;
      }

      response.status(status).json({
        error: {
          code: statusToCode(status),
          message: extractMessage(body),
        },
      });

      return;
    }

    response.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
}
