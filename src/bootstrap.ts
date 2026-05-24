import { INestApplication, ValidationPipe } from '@nestjs/common';

import { ProblemDetailsFilter } from './common/filters/problem-details.filter';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
}
