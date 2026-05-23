import { Controller, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { CreateAccountResponse } from './accounts.types';
import { AccountsService } from './accounts.service';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @UseGuards(JwtGuard)
  async create(@CurrentUser() userId: string): Promise<CreateAccountResponse> {
    return this.accountsService.create(userId);
  }
}
