import { Module } from '@nestjs/common';

import { IdempotencyKeyPipe } from '../common/pipes/idempotency-key.pipe';
import { DepositsController } from './deposits.controller';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  controllers: [TransactionsController, DepositsController],
  providers: [TransactionsService, IdempotencyKeyPipe],
})
export class TransactionsModule {}
