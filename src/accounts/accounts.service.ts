import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable } from '@nestjs/common';

import { formatMoney } from '../common/money/format-money';
import { DatabaseService } from '../db/database.service';
import { accounts } from '../db/schema';
import { CreateAccountResponse } from './accounts.types';

@Injectable()
export class AccountsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(userId: string): Promise<CreateAccountResponse> {
    const [account] = await this.databaseService.db
      .insert(accounts)
      .values({
        id: randomUUID(),
        userId,
        balance: '0.0000',
      })
      .onConflictDoNothing({ target: accounts.userId })
      .returning({
        id: accounts.id,
        balance: accounts.balance,
        createdAt: accounts.createdAt,
      });

    if (!account) {
      throw new ConflictException({
        error: {
          code: 'ACCOUNT_ALREADY_EXISTS',
          message: 'Account already exists',
        },
      });
    }

    return {
      id: account.id,
      balance: formatMoney(account.balance),
      createdAt: account.createdAt.toISOString(),
    };
  }
}