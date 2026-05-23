import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { formatMoney } from '../common/money/format-money';
import { TransactionType } from '../common/transactions/transaction-type';
import { DatabaseService } from '../db/database.service';
import { accounts, transactions } from '../db/schema';
import { decodeCursor, encodeCursor } from './cursor';
import { DepositResponse, TransactionHistoryItem, TransactionHistoryResponse, WithdrawalResponse } from './transactions.types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type DepositResult = {
  response: DepositResponse;
  replayed: boolean;
};

type WithdrawalResult = {
  response: WithdrawalResponse;
  replayed: boolean;
};

type StoredTransaction = {
  id: string;
  amount: string;
  type: string;
  createdAt: Date;
  accountId: string;
};

@Injectable()
export class TransactionsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async createDeposit(userId: string, idempotencyKey: string, rawAmount: string): Promise<DepositResult> {
    const amount = this.normalizePositiveAmount(rawAmount);
    const account = await this.findAccountByUserId(userId);

    try {
      const response = await this.databaseService.db.transaction(async (tx) => {
        const [lockedAccount] = await tx
          .select({ id: accounts.id, balance: accounts.balance })
          .from(accounts)
          .where(eq(accounts.id, account.id))
          .for('update')
          .limit(1);

        if (!lockedAccount) {
          throw this.accountNotFoundException();
        }

        const [createdTransaction] = await tx
          .insert(transactions)
          .values({
            id: uuidv7(),
            accountId: account.id,
            amount,
            type: TransactionType.DEPOSIT,
            idempotencyKey,
          })
          .returning({
            id: transactions.id,
            amount: transactions.amount,
            type: transactions.type,
            createdAt: transactions.createdAt,
          });

        await tx
          .update(accounts)
          .set({
            balance: sql`${accounts.balance} + ${amount}`,
          })
          .where(eq(accounts.id, account.id));

        return this.toDepositResponse({
          ...createdTransaction,
          accountId: account.id,
        });
      });

      return { response, replayed: false };
    } catch (error: unknown) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const existingTransaction = await this.findTransactionByIdempotencyKey(idempotencyKey);

      if (!existingTransaction) {
        throw error;
      }

      if (
        existingTransaction.accountId !== account.id ||
        existingTransaction.type !== TransactionType.DEPOSIT ||
        formatMoney(existingTransaction.amount) !== amount
      ) {
        throw this.idempotencyKeyReusedException();
      }

      return {
        response: this.toDepositResponse(existingTransaction),
        replayed: true,
      };
    }
  }

  async createWithdrawal(userId: string, idempotencyKey: string, rawAmount: string): Promise<WithdrawalResult> {
    const requestedAmount = this.normalizePositiveAmount(rawAmount);
    const storedAmount = this.negateAmount(requestedAmount);
    const account = await this.findAccountByUserId(userId);

    try {
      const response = await this.databaseService.db.transaction(async (tx) => {
        const [lockedAccount] = await tx
          .select({ id: accounts.id, balance: accounts.balance })
          .from(accounts)
          .where(eq(accounts.id, account.id))
          .for('update')
          .limit(1);

        if (!lockedAccount) {
          throw this.accountNotFoundException();
        }

        if (!this.hasSufficientFunds(lockedAccount.balance, requestedAmount)) {
          throw new UnprocessableEntityException({
            error: {
              code: 'INSUFFICIENT_FUNDS',
              message: 'Account balance is lower than requested withdrawal amount',
            },
          });
        }

        const [createdTransaction] = await tx
          .insert(transactions)
          .values({
            id: uuidv7(),
            accountId: account.id,
            amount: storedAmount,
            type: TransactionType.WITHDRAWAL,
            idempotencyKey,
          })
          .returning({
            id: transactions.id,
            amount: transactions.amount,
            type: transactions.type,
            createdAt: transactions.createdAt,
          });

        await tx
          .update(accounts)
          .set({
            balance: sql`${accounts.balance} + ${storedAmount}`,
          })
          .where(eq(accounts.id, account.id));

        return this.toWithdrawalResponse({
          ...createdTransaction,
          accountId: account.id,
        });
      });

      return { response, replayed: false };
    } catch (error: unknown) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const existingTransaction = await this.findTransactionByIdempotencyKey(idempotencyKey);

      if (!existingTransaction) {
        throw error;
      }

      if (
        existingTransaction.accountId !== account.id ||
        existingTransaction.type !== TransactionType.WITHDRAWAL ||
        formatMoney(existingTransaction.amount) !== storedAmount
      ) {
        throw this.idempotencyKeyReusedException();
      }

      return {
        response: this.toWithdrawalResponse(existingTransaction),
        replayed: true,
      };
    }
  }

  async listByUserId(userId: string, cursor?: string, limit = DEFAULT_LIMIT): Promise<TransactionHistoryResponse> {
    const sanitizedLimit = this.sanitizeLimit(limit);
    const account = await this.findAccountByUserId(userId);

    const decodedCursor = cursor ? decodeCursor(cursor) : null;
    const rows = await this.databaseService.db
      .select({
        id: transactions.id,
        amount: transactions.amount,
        type: transactions.type,
        transferId: transactions.transferId,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, account.id),
          decodedCursor
            ? sql`(${transactions.createdAt}, ${transactions.id}) < (${decodedCursor.ts}::timestamptz, ${decodedCursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(transactions.createdAt), desc(transactions.id))
      .limit(sanitizedLimit + 1);

    const hasNextPage = rows.length > sanitizedLimit;
    const visibleRows = hasNextPage ? rows.slice(0, sanitizedLimit) : rows;
    const items = visibleRows.map((row): TransactionHistoryItem => ({
      id: row.id,
      amount: formatMoney(row.amount),
      type: row.type as TransactionType,
      transferId: row.transferId,
      createdAt: row.createdAt.toISOString(),
    }));

    const lastVisibleRow = visibleRows.at(-1);

    return {
      items,
      nextCursor:
        hasNextPage && lastVisibleRow
          ? encodeCursor({
              ts: lastVisibleRow.createdAt.toISOString(),
              id: lastVisibleRow.id,
            })
          : null,
    };
  }

  // Si este patrón se repite en otros endpoints, conviene moverlo a un
  // PaginationLimitPipe para reutilizar el parseo, el mínimo y el cap máximo
  // antes de entrar al service.
  private sanitizeLimit(limit: number): number {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'limit must be a positive integer',
        },
      });
    }

    return Math.min(limit, MAX_LIMIT);
  }

  private async findAccountByUserId(userId: string): Promise<{ id: string }> {
    const [account] = await this.databaseService.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .limit(1);

    if (!account) {
      throw this.accountNotFoundException();
    }

    return account;
  }

  private async findTransactionByIdempotencyKey(idempotencyKey: string): Promise<StoredTransaction | undefined> {
    const [transaction] = await this.databaseService.db
      .select({
        id: transactions.id,
        amount: transactions.amount,
        type: transactions.type,
        createdAt: transactions.createdAt,
        accountId: transactions.accountId,
      })
      .from(transactions)
      .where(eq(transactions.idempotencyKey, idempotencyKey))
      .limit(1);

    return transaction;
  }

  private normalizePositiveAmount(value: string): string {
    const amount = formatMoney(value);

    if (amount === '0.0000') {
      throw new BadRequestException({
        error: {
          code: 'INVALID_AMOUNT',
          message: 'amount must be greater than zero',
        },
      });
    }

    return amount;
  }

  private negateAmount(amount: string): string {
    return amount.startsWith('-') ? amount : `-${amount}`;
  }

  private hasSufficientFunds(balance: string, requestedAmount: string): boolean {
    return this.toScaledUnits(balance) >= this.toScaledUnits(requestedAmount);
  }

  private toScaledUnits(amount: string): bigint {
    const normalizedAmount = formatMoney(amount);
    const isNegative = normalizedAmount.startsWith('-');
    const absoluteAmount = isNegative ? normalizedAmount.slice(1) : normalizedAmount;
    const [integerPart, fractionalPart] = absoluteAmount.split('.');
    const scaledUnits = BigInt(`${integerPart}${fractionalPart}`);

    return isNegative ? -scaledUnits : scaledUnits;
  }

  private isUniqueViolation(error: unknown): error is { code: string } {
    return this.extractErrorCode(error) === '23505';
  }

  private extractErrorCode(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null) {
      return undefined;
    }

    if ('code' in error && typeof (error as { code?: unknown }).code === 'string') {
      return (error as { code: string }).code;
    }

    if ('cause' in error) {
      return this.extractErrorCode((error as { cause?: unknown }).cause);
    }

    return undefined;
  }

  private accountNotFoundException(): NotFoundException {
    return new NotFoundException({
      error: {
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Account not found',
      },
    });
  }

  private idempotencyKeyReusedException(): ConflictException {
    return new ConflictException({
      error: {
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key was already used with a different payload',
      },
    });
  }

  private toDepositResponse(transaction: StoredTransaction): DepositResponse {
    return {
      transactionId: transaction.id,
      amount: formatMoney(transaction.amount),
      type: TransactionType.DEPOSIT,
      createdAt: transaction.createdAt.toISOString(),
    };
  }

  private toWithdrawalResponse(transaction: StoredTransaction): WithdrawalResponse {
    const amount = formatMoney(transaction.amount);

    return {
      transactionId: transaction.id,
      amount: amount.startsWith('-') ? amount.slice(1) : amount,
      type: TransactionType.WITHDRAWAL,
      createdAt: transaction.createdAt.toISOString(),
    };
  }
}
