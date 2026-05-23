import { Body, Controller, Headers, Post, Res, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { IdempotencyKeyPipe } from '../common/pipes/idempotency-key.pipe';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { TransactionsService } from './transactions.service';
import { WithdrawalResponse } from './transactions.types';

type ResponseLike = {
  status(code: number): void;
};

@Controller('accounts/me/withdrawals')
export class WithdrawalsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly idempotencyKeyPipe: IdempotencyKeyPipe,
  ) {}

  @Post()
  @UseGuards(JwtGuard)
  async create(
    @CurrentUser() userId: string,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
    @Body() dto: CreateWithdrawalDto,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<WithdrawalResponse> {
    const idempotencyKey = this.idempotencyKeyPipe.transform(rawIdempotencyKey);
    const result = await this.transactionsService.createWithdrawal(userId, idempotencyKey, dto.amount);

    response.status(result.replayed ? 200 : 201);

    return result.response;
  }
}