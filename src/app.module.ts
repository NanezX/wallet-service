import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AccountsModule } from './accounts/accounts.module';
import { AuthModule } from './auth/auth.module';
import { envValidationSchema } from './config/env';
import { DatabaseModule } from './db/database.module';
import { HealthModule } from './health/health.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        // Si más adelante queremos cerrar el paso a typos de env vars con
        // allowUnknown: false, primero conviene modelar NODE_ENV en el schema
        // para endurecer producción sin volver incómodo development/test.
        allowUnknown: true,
        convert: true,
      },
    }),
    AuthModule,
    AccountsModule,
    DatabaseModule,
    HealthModule,
    TransactionsModule,
  ],
})
export class AppModule {}
