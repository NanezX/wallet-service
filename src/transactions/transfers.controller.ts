import { Body, Controller, Headers, Post, Res, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { IdempotencyKeyPipe } from '../common/pipes/idempotency-key.pipe';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransactionsService } from './transactions.service';
import { TransferResponse } from './transactions.types';

type ResponseLike = {
  status(code: number): void;
};

@Controller('transfers')
export class TransfersController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly idempotencyKeyPipe: IdempotencyKeyPipe,
  ) {}

  @Post()
  @UseGuards(JwtGuard)
  async create(
    @CurrentUser() userId: string,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
    @Body() dto: CreateTransferDto,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<TransferResponse> {
    const idempotencyKey = this.idempotencyKeyPipe.transform(rawIdempotencyKey);
    const result = await this.transactionsService.createTransfer(
      userId,
      idempotencyKey,
      dto.destination_account_id,
      dto.amount,
    );

    response.status(result.replayed ? 200 : 201);

    return result.response;
  }
}