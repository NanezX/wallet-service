import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isUUID } from 'class-validator';

function invalidIdempotencyKey(): BadRequestException {
  return new BadRequestException({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'X-Idempotency-Key must be a valid UUIDv4',
    },
  });
}

@Injectable()
export class IdempotencyKeyPipe implements PipeTransform<string | undefined, string> {
  transform(value: string | undefined): string {
    if (!value || !isUUID(value, '4')) {
      throw invalidIdempotencyKey();
    }
    
    return value;
  }
}
