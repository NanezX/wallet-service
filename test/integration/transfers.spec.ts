import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';

import { configureApp } from 'src/bootstrap';
import { DatabaseService } from 'src/db/database.service';
import { runMigrations } from 'src/db/migrate';
import { TransactionsService } from 'src/transactions/transactions.service';
import { authHeader } from 'test/helpers/jwt';

describe('Transfers', () => {
  jest.setTimeout(60_000);

  let app: INestApplication;
  let container: StartedPostgreSqlContainer;
  let appModule: typeof import('src/app.module').AppModule;

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
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (container) {
      await container.stop();
    }
  });

  it('requires X-Idempotency-Key for transfers', async () => {
    const sourceUserId = randomUUID();
    const destinationUserId = randomUUID();

    const sourceAccount = await createFundedAccount(app, sourceUserId, '100.0000');
    const destinationAccount = await createAccount(app, destinationUserId);

    await request(app.getHttpServer())
      .post('/v1/transfers')
      .set(authHeader(sourceUserId))
      .send({
        destination_account_id: destinationAccount.id,
        amount: '10.0000',
      })
      .expect(400);

    expect(sourceAccount.id).toEqual(expect.any(String));
  });

  it('creates a transfer and replays the same idempotency key without duplicating the effect', async () => {
    const sourceUserId = randomUUID();
    const destinationUserId = randomUUID();
    const idempotencyKey = randomUUID();

    const sourceAccount = await createFundedAccount(app, sourceUserId, '100.0000');
    const destinationAccount = await createAccount(app, destinationUserId);

    const firstResponse = await request(app.getHttpServer())
      .post('/v1/transfers')
      .set(authHeader(sourceUserId))
      .set('X-Idempotency-Key', idempotencyKey)
      .send({
        destination_account_id: destinationAccount.id,
        amount: '30.0000',
      })
      .expect(201);

    expect(firstResponse.body).toEqual({
      transferId: expect.any(String),
      amount: '30.0000',
      destinationAccountId: destinationAccount.id,
      createdAt: expect.any(String),
    });

    const replayResponse = await request(app.getHttpServer())
      .post('/v1/transfers')
      .set(authHeader(sourceUserId))
      .set('X-Idempotency-Key', idempotencyKey)
      .send({
        destination_account_id: destinationAccount.id,
        amount: '30.0000',
      })
      .expect(200);

    expect(replayResponse.body).toEqual(firstResponse.body);

    const sourceBalance = await getAccount(app, sourceUserId);
    const destinationBalance = await getAccount(app, destinationUserId);

    expect(sourceBalance.id).toBe(sourceAccount.id);
    expect(sourceBalance.balance).toBe('70.0000');
    expect(destinationBalance.balance).toBe('30.0000');

    const databaseService = app.get(DatabaseService);
    const countByTransferId = await databaseService.pool.query<{ count: number }>(
      'select count(*)::int as count from transactions where transfer_id = $1',
      [firstResponse.body.transferId],
    );
    const countByIdempotencyKey = await databaseService.pool.query<{ count: number }>(
      'select count(*)::int as count from transactions where idempotency_key = $1',
      [idempotencyKey],
    );

    expect(countByTransferId.rows[0]?.count).toBe(2);
    expect(countByIdempotencyKey.rows[0]?.count).toBe(1);
  });

  it('rejects reusing an idempotency key with a different destination account', async () => {
    const sourceUserId = randomUUID();
    const firstDestinationUserId = randomUUID();
    const secondDestinationUserId = randomUUID();
    const idempotencyKey = randomUUID();

    await createFundedAccount(app, sourceUserId, '100.0000');
    const firstDestinationAccount = await createAccount(app, firstDestinationUserId);
    const secondDestinationAccount = await createAccount(app, secondDestinationUserId);

    await request(app.getHttpServer())
      .post('/v1/transfers')
      .set(authHeader(sourceUserId))
      .set('X-Idempotency-Key', idempotencyKey)
      .send({
        destination_account_id: firstDestinationAccount.id,
        amount: '40.0000',
      })
      .expect(201);

    const conflictResponse = await request(app.getHttpServer())
      .post('/v1/transfers')
      .set(authHeader(sourceUserId))
      .set('X-Idempotency-Key', idempotencyKey)
      .send({
        destination_account_id: secondDestinationAccount.id,
        amount: '40.0000',
      })
      .expect(409);

    expect(conflictResponse.body).toEqual({
      error: {
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key was already used with a different payload',
      },
    });

    expect((await getAccount(app, firstDestinationUserId)).balance).toBe('40.0000');
    expect((await getAccount(app, secondDestinationUserId)).balance).toBe('0.0000');
  });

  it('rejects transferring to the same account', async () => {
    const sourceUserId = randomUUID();
    const sourceAccount = await createFundedAccount(app, sourceUserId, '100.0000');

    const response = await request(app.getHttpServer())
      .post('/v1/transfers')
      .set(authHeader(sourceUserId))
      .set('X-Idempotency-Key', randomUUID())
      .send({
        destination_account_id: sourceAccount.id,
        amount: '10.0000',
      })
      .expect(422);

    expect(response.body).toEqual({
      error: {
        code: 'SELF_TRANSFER',
        message: 'Source and destination accounts must be different',
      },
    });

    expect((await getAccount(app, sourceUserId)).balance).toBe('100.0000');
  });

  it('rejects a transfer when the destination account does not exist', async () => {
    const sourceUserId = randomUUID();

    await createFundedAccount(app, sourceUserId, '100.0000');

    const response = await request(app.getHttpServer())
      .post('/v1/transfers')
      .set(authHeader(sourceUserId))
      .set('X-Idempotency-Key', randomUUID())
      .send({
        destination_account_id: randomUUID(),
        amount: '10.0000',
      })
      .expect(404);

    expect(response.body).toEqual({
      error: {
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Account not found',
      },
    });
  });

  it('rejects a transfer when the balance is not enough', async () => {
    const sourceUserId = randomUUID();
    const destinationUserId = randomUUID();

    await createFundedAccount(app, sourceUserId, '10.0000');
    const destinationAccount = await createAccount(app, destinationUserId);

    const response = await request(app.getHttpServer())
      .post('/v1/transfers')
      .set(authHeader(sourceUserId))
      .set('X-Idempotency-Key', randomUUID())
      .send({
        destination_account_id: destinationAccount.id,
        amount: '20.0000',
      })
      .expect(422);

    expect(response.body).toEqual({
      error: {
        code: 'INSUFFICIENT_FUNDS',
        message: 'Account balance is lower than requested transfer amount',
      },
    });

    expect((await getAccount(app, sourceUserId)).balance).toBe('10.0000');
    expect((await getAccount(app, destinationUserId)).balance).toBe('0.0000');
  });

  it('rolls back the whole transfer when the credit insert fails', async () => {
    const sourceUserId = randomUUID();
    const destinationUserId = randomUUID();

    const sourceAccount = await createFundedAccount(app, sourceUserId, '100.0000');
    const destinationAccount = await createAccount(app, destinationUserId);
    const transactionsService = app.get(TransactionsService);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const insertTransferInSpy = jest
      .spyOn(transactionsService as any, 'insertTransferIn')
      .mockImplementationOnce(async () => {
        throw new Error('boom');
      });

    try {
      await request(app.getHttpServer())
        .post('/v1/transfers')
        .set(authHeader(sourceUserId))
        .set('X-Idempotency-Key', randomUUID())
        .send({
          destination_account_id: destinationAccount.id,
          amount: '30.0000',
        })
        .expect(500);
    } finally {
      insertTransferInSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    }

    expect((await getAccount(app, sourceUserId)).balance).toBe('100.0000');
    expect((await getAccount(app, destinationUserId)).balance).toBe('0.0000');

    const databaseService = app.get(DatabaseService);
    const countResult = await databaseService.pool.query<{ count: number }>(
      "select count(*)::int as count from transactions where account_id in ($1, $2) and type in ('TRANSFER_OUT', 'TRANSFER_IN')",
      [sourceAccount.id, destinationAccount.id],
    );

    expect(countResult.rows[0]?.count).toBe(0);
  });

  it('completes inverse concurrent transfers without deadlocks or balance drift', async () => {
    const firstUserId = randomUUID();
    const secondUserId = randomUUID();

    const firstAccount = await createFundedAccount(app, firstUserId, '100.0000');
    const secondAccount = await createFundedAccount(app, secondUserId, '100.0000');

    const requests = [
      ...Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post('/v1/transfers')
          .set(authHeader(firstUserId))
          .set('X-Idempotency-Key', randomUUID())
          .send({
            destination_account_id: secondAccount.id,
            amount: '10.0000',
          }),
      ),
      ...Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post('/v1/transfers')
          .set(authHeader(secondUserId))
          .set('X-Idempotency-Key', randomUUID())
          .send({
            destination_account_id: firstAccount.id,
            amount: '10.0000',
          }),
      ),
    ];

    const results = await Promise.allSettled(requests);
    const rejectedResults = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');

    expect(rejectedResults).toEqual([]);

    const responses = results
      .filter((result): result is PromiseFulfilledResult<request.Response> => result.status === 'fulfilled')
      .map((result) => result.value);

    expect(responses.every((response) => response.status === 201)).toBe(true);

    const firstBalance = await getAccount(app, firstUserId);
    const secondBalance = await getAccount(app, secondUserId);

    expect(firstBalance.balance).toBe('100.0000');
    expect(secondBalance.balance).toBe('100.0000');

    const databaseService = app.get(DatabaseService);
    const firstInvariant = await databaseService.pool.query<{ total: string }>(
      'select coalesce(sum(amount), 0)::text as total from transactions where account_id = $1',
      [firstAccount.id],
    );
    const secondInvariant = await databaseService.pool.query<{ total: string }>(
      'select coalesce(sum(amount), 0)::text as total from transactions where account_id = $1',
      [secondAccount.id],
    );

    expect(firstInvariant.rows[0]?.total).toBe('100.0000');
    expect(secondInvariant.rows[0]?.total).toBe('100.0000');
  });
});

async function createAccount(app: INestApplication, userId: string): Promise<{ id: string }> {
  const response = await request(app.getHttpServer()).post('/v1/accounts').set(authHeader(userId)).expect(201);

  return response.body as { id: string };
}

async function createFundedAccount(app: INestApplication, userId: string, amount: string): Promise<{ id: string }> {
  const account = await createAccount(app, userId);

  await request(app.getHttpServer())
    .post('/v1/accounts/me/deposits')
    .set(authHeader(userId))
    .set('X-Idempotency-Key', randomUUID())
    .send({ amount })
    .expect(201);

  return account;
}

async function getAccount(app: INestApplication, userId: string): Promise<{ id: string; balance: string }> {
  const response = await request(app.getHttpServer()).get('/v1/accounts/me').set(authHeader(userId)).expect(200);

  return response.body as { id: string; balance: string };
}