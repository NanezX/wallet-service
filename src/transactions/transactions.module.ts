import { Module } from '@nestjs/common';

import { IdempotencyKeyPipe } from '../common/pipes/idempotency-key.pipe';
import { DepositsController } from './deposits.controller';
import { TransfersController } from './transfers.controller';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { WithdrawalsController } from './withdrawals.controller';

@Module({
  controllers: [TransactionsController, DepositsController, WithdrawalsController, TransfersController],
  providers: [TransactionsService, IdempotencyKeyPipe],
})
export class TransactionsModule {}
