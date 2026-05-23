import { Body, Controller, Headers, Post, Res, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { IdempotencyKeyPipe } from '../common/pipes/idempotency-key.pipe';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { DepositResponse } from './transactions.types';
import { TransactionsService } from './transactions.service';

type ResponseLike = {
  status(code: number): void;
};

@Controller('accounts/me/deposits')
export class DepositsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly idempotencyKeyPipe: IdempotencyKeyPipe,
  ) {}

  @Post()
  @UseGuards(JwtGuard)
  async create(
    @CurrentUser() userId: string,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
    @Body() dto: CreateDepositDto,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<DepositResponse> {
    const idempotencyKey = this.idempotencyKeyPipe.transform(rawIdempotencyKey);
    const result = await this.transactionsService.createDeposit(userId, idempotencyKey, dto.amount);

    response.status(result.replayed ? 200 : 201);

    return result.response;
  }
}
