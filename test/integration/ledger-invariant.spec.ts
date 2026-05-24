import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

import { AccountsService } from 'src/accounts/accounts.service';
import { configureApp } from 'src/bootstrap';
import { formatMoney } from 'src/common/money/format-money';
import { DatabaseService } from 'src/db/database.service';
import { runMigrations } from 'src/db/migrate';
import { TransactionsService } from 'src/transactions/transactions.service';

type TestAccount = {
  userId: string;
  accountId: string;
};

type Operation =
  | {
      kind: 'deposit';
      userId: string;
      amount: string;
    }
  | {
      kind: 'withdrawal';
      userId: string;
      amount: string;
    }
  | {
      kind: 'transfer';
      userId: string;
      destinationAccountId: string;
      amount: string;
    };

type ExecutedOperation = {
  status: number;
};

describe('Ledger invariant', () => {
  jest.setTimeout(60_000);

  let app: INestApplication;
  let container: StartedPostgreSqlContainer;
  let appModule: typeof import('src/app.module').AppModule;
  let accountsService: AccountsService;
  let transactionsService: TransactionsService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.JWT_SECRET = 'test-secret';

    await runMigrations(process.env.DATABASE_URL);

    ({ AppModule: appModule } = await import('src/app.module'));

    const testingModule = await Test.createTestingModule({
      imports: [appModule],
    }).compile();

    app = testingModule.createNestApplication();
    configureApp(app);

    await app.init();

    accountsService = app.get(AccountsService);
    transactionsService = app.get(TransactionsService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (container) {
      await container.stop();
    }
  });

  it('preserves accounts.balance == SUM(transactions.amount) under a mixed concurrent workload', async () => {
    const random = createDeterministicRandom(20260523);
    const accounts = await Promise.all(
      Array.from({ length: 5 }, async () => {
        const userId = randomUUID();
        const initialBalance = toMoney(50 + Math.floor(random() * 151));
        const accountId = await createFundedAccount(accountsService, transactionsService, userId, initialBalance);

        return { userId, accountId } satisfies TestAccount;
      }),
    );

    const operations = Array.from({ length: 200 }, () => buildOperation(accounts, random));
    const results = await runWithConcurrencyLimit(
      operations.map((operation) => async () => performOperation(transactionsService, operation)),
      20,
    );
    const rejectedResults = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');

    expect(rejectedResults).toEqual([]);

    const responses = results
      .filter((result): result is PromiseFulfilledResult<ExecutedOperation> => result.status === 'fulfilled')
      .map((result) => result.value);

    for (const [index, response] of responses.entries()) {
      const operation = operations[index];

      if (operation.kind === 'deposit') {
        expect(response.status).toBe(201);
        continue;
      }

      expect([201, 422]).toContain(response.status);
    }

    const databaseService = app.get(DatabaseService);

    for (const account of accounts) {
      const balanceResult = await databaseService.pool.query<{ balance: string }>(
        'select balance::text as balance from accounts where id = $1',
        [account.accountId],
      );
      const totalResult = await databaseService.pool.query<{ total: string }>(
        'select coalesce(sum(amount), 0)::text as total from transactions where account_id = $1',
        [account.accountId],
      );

      expect(formatMoney(balanceResult.rows[0]?.balance ?? '0')).toBe(formatMoney(totalResult.rows[0]?.total ?? '0'));
    }
  });
});

async function createFundedAccount(
  accountsService: AccountsService,
  transactionsService: TransactionsService,
  userId: string,
  amount: string,
): Promise<string> {
  const account = await accountsService.create(userId);

  await transactionsService.createDeposit(userId, randomUUID(), amount);

  return account.id;
}

function buildOperation(accounts: TestAccount[], random: () => number): Operation {
  const sourceIndex = Math.floor(random() * accounts.length);
  const sourceAccount = accounts[sourceIndex];
  const amount = toMoney(1 + Math.floor(random() * 25));
  const operationKind = Math.floor(random() * 3);

  if (operationKind === 0) {
    return {
      kind: 'deposit',
      userId: sourceAccount.userId,
      amount,
    };
  }

  if (operationKind === 1) {
    return {
      kind: 'withdrawal',
      userId: sourceAccount.userId,
      amount,
    };
  }

  const destinationIndex = (sourceIndex + 1 + Math.floor(random() * (accounts.length - 1))) % accounts.length;

  return {
    kind: 'transfer',
    userId: sourceAccount.userId,
    destinationAccountId: accounts[destinationIndex]!.accountId,
    amount,
  };
}

async function performOperation(
  transactionsService: TransactionsService,
  operation: Operation,
): Promise<ExecutedOperation> {
  try {
    if (operation.kind === 'deposit') {
      await transactionsService.createDeposit(operation.userId, randomUUID(), operation.amount);

      return { status: 201 };
    }

    if (operation.kind === 'withdrawal') {
      await transactionsService.createWithdrawal(operation.userId, randomUUID(), operation.amount);

      return { status: 201 };
    }

    await transactionsService.createTransfer(
      operation.userId,
      randomUUID(),
      operation.destinationAccountId,
      operation.amount,
    );

    return { status: 201 };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'getStatus' in error && typeof error.getStatus === 'function') {
      return { status: error.getStatus() as number };
    }

    throw error;
  }
}

async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<Array<PromiseSettledResult<T>>> {
  const results = new Array<PromiseSettledResult<T>>(tasks.length);
  let nextTaskIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (nextTaskIndex < tasks.length) {
        const currentTaskIndex = nextTaskIndex;
        nextTaskIndex += 1;
        try {
          results[currentTaskIndex] = {
            status: 'fulfilled',
            value: await tasks[currentTaskIndex]!(),
          };
        } catch (error) {
          results[currentTaskIndex] = {
            status: 'rejected',
            reason: error,
          };
        }
      }
    }),
  );

  return results;
}

function createDeterministicRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function toMoney(units: number): string {
  return `${units}.0000`;
}