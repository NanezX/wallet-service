import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { TransactionHistoryResponse } from './transactions.types';
import { TransactionsService } from './transactions.service';

@Controller('accounts/me/transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @UseGuards(JwtGuard)
  async list(
    @CurrentUser() userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ): Promise<TransactionHistoryResponse> {
    return this.transactionsService.listByUserId(userId, cursor, limit);
  }
}
