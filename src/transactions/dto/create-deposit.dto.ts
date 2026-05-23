import { IsString, Matches, IsDecimal } from 'class-validator';

export class CreateDepositDto {
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'amount must be a positive decimal string with up to 4 decimal places',
  })
  amount!: string;
}
