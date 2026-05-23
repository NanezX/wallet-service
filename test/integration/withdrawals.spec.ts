import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';

import { configureApp } from 'src/bootstrap';
import { TransactionType } from 'src/common/transactions/transaction-type';
import { DatabaseService } from 'src/db/database.service';
import { runMigrations } from 'src/db/migrate';
import { authHeader } from 'test/helpers/jwt';

describe('Withdrawals', () => {
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

  it('requires X-Idempotency-Key for withdrawals', async () => {
    const userId = randomUUID();

    await request(app.getHttpServer()).post('/v1/accounts').set(authHeader(userId)).expect(201);

    await request(app.getHttpServer())
      .post('/v1/accounts/me/withdrawals')
      .set(authHeader(userId))
      .send({ amount: '10.0000' })
      .expect(400);
  });

  it('creates a withdrawal and replays the same idempotency key without duplicating the effect', async () => {
    const userId = randomUUID();
    const idempotencyKey = randomUUID();

    await createFundedAccount(app, userId, '100.0000');

    const firstResponse = await request(app.getHttpServer())
      .post('/v1/accounts/me/withdrawals')
      .set(authHeader(userId))
      .set('X-Idempotency-Key', idempotencyKey)
      .send({ amount: '40.0000' })
      .expect(201);

    expect(firstResponse.body).toEqual({
      transactionId: expect.any(String),
      amount: '40.0000',
      type: TransactionType.WITHDRAWAL,
      createdAt: expect.any(String),
    });

    const replayResponse = await request(app.getHttpServer())
      .post('/v1/accounts/me/withdrawals')
      .set(authHeader(userId))
      .set('X-Idempotency-Key', idempotencyKey)
      .send({ amount: '40.0000' })
      .expect(200);

    expect(replayResponse.body).toEqual(firstResponse.body);

    const balanceResponse = await request(app.getHttpServer()).get('/v1/accounts/me').set(authHeader(userId)).expect(200);

    expect(balanceResponse.body.balance).toBe('60.0000');

    const databaseService = app.get(DatabaseService);
    const countResult = await databaseService.pool.query<{ count: number }>(
      'select count(*)::int as count from transactions where idempotency_key = $1',
      [idempotencyKey],
    );

    expect(countResult.rows[0]?.count).toBe(1);
  });

  it('rejects reusing an idempotency key with a different payload', async () => {
    const userId = randomUUID();
    const idempotencyKey = randomUUID();

    await createFundedAccount(app, userId, '100.0000');

    await request(app.getHttpServer())
      .post('/v1/accounts/me/withdrawals')
      .set(authHeader(userId))
      .set('X-Idempotency-Key', idempotencyKey)
      .send({ amount: '40.0000' })
      .expect(201);

    const conflictResponse = await request(app.getHttpServer())
      .post('/v1/accounts/me/withdrawals')
      .set(authHeader(userId))
      .set('X-Idempotency-Key', idempotencyKey)
      .send({ amount: '50.0000' })
      .expect(409);

    expect(conflictResponse.body).toEqual({
      error: {
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key was already used with a different payload',
      },
    });

    const balanceResponse = await request(app.getHttpServer()).get('/v1/accounts/me').set(authHeader(userId)).expect(200);

    expect(balanceResponse.body.balance).toBe('60.0000');
  });

  it('rejects a withdrawal when the balance is not enough', async () => {
    const userId = randomUUID();

    await createFundedAccount(app, userId, '50.0000');

    const response = await request(app.getHttpServer())
      .post('/v1/accounts/me/withdrawals')
      .set(authHeader(userId))
      .set('X-Idempotency-Key', randomUUID())
      .send({ amount: '60.0000' })
      .expect(422);

    expect(response.body).toEqual({
      error: {
        code: 'INSUFFICIENT_FUNDS',
        message: 'Account balance is lower than requested withdrawal amount',
      },
    });

    const balanceResponse = await request(app.getHttpServer()).get('/v1/accounts/me').set(authHeader(userId)).expect(200);

    expect(balanceResponse.body.balance).toBe('50.0000');
  });

  it('allows only two concurrent withdrawals of 50 from a balance of 100', async () => {
    const userId = randomUUID();

    await createFundedAccount(app, userId, '100.0000');

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app.getHttpServer())
          .post('/v1/accounts/me/withdrawals')
          .set(authHeader(userId))
          .set('X-Idempotency-Key', randomUUID())
          .send({ amount: '50.0000' }),
      ),
    );

    expect(responses.filter((response) => response.status === 201)).toHaveLength(2);
    expect(responses.filter((response) => response.status === 422)).toHaveLength(8);

    const balanceResponse = await request(app.getHttpServer()).get('/v1/accounts/me').set(authHeader(userId)).expect(200);

    expect(balanceResponse.body.balance).toBe('0.0000');

    const databaseService = app.get(DatabaseService);
    const accountId = balanceResponse.body.id as string;
    const countResult = await databaseService.pool.query<{ count: number }>(
      "select count(*)::int as count from transactions where account_id = $1 and type = 'WITHDRAWAL'",
      [accountId],
    );
    const sumResult = await databaseService.pool.query<{ total: string }>(
      'select coalesce(sum(amount), 0)::text as total from transactions where account_id = $1',
      [accountId],
    );

    expect(countResult.rows[0]?.count).toBe(2);
    expect(sumResult.rows[0]?.total).toBe('0.0000');
  });
});

async function createFundedAccount(app: INestApplication, userId: string, amount: string): Promise<void> {
  await request(app.getHttpServer()).post('/v1/accounts').set(authHeader(userId)).expect(201);

  await request(app.getHttpServer())
    .post('/v1/accounts/me/deposits')
    .set(authHeader(userId))
    .set('X-Idempotency-Key', randomUUID())
    .send({ amount })
    .expect(201);
}