import { IsUUID } from 'class-validator';

import { TransactionAmountDto } from './transaction-amount.dto';

export class CreateTransferDto extends TransactionAmountDto {
  @IsUUID('4')
  destination_account_id!: string;
}