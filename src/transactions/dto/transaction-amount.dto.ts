import { IsString, Matches } from 'class-validator';

export class TransactionAmountDto {
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'amount must be a positive decimal string with up to 4 decimal places',
  })
  amount!: string;
}