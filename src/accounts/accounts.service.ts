import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { formatMoney } from '../common/money/format-money';
import { DatabaseService } from '../db/database.service';
import { accounts } from '../db/schema';
import { CreateAccountResponse } from './accounts.types';

@Injectable()
export class AccountsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findByUserId(userId: string): Promise<CreateAccountResponse> {
    const [account] = await this.databaseService.db
      .select({
        id: accounts.id,
        balance: accounts.balance,
        createdAt: accounts.createdAt,
      })
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .limit(1);

    if (!account) {
      throw new NotFoundException({
        error: {
          code: 'ACCOUNT_NOT_FOUND',
          message: 'Account not found',
        },
      });
    }

    return this.toResponse(account);
  }

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

    return this.toResponse(account);
  }

  private toResponse(account: { id: string; balance: string; createdAt: Date }): CreateAccountResponse {
    return {
      id: account.id,
      balance: formatMoney(account.balance),
      createdAt: account.createdAt.toISOString(),
    };
  }
}