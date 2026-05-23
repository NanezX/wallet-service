import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { configureApp } from 'src/bootstrap';
import { TransactionType } from 'src/common/transactions/transaction-type';
import { DatabaseService } from 'src/db/database.service';
import { runMigrations } from 'src/db/migrate';
import { authHeader } from 'test/helpers/jwt';

describe('Deposits', () => {
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

  it('requires X-Idempotency-Key for deposits', async () => {
    const userId = randomUUID();

    await request(app.getHttpServer()).post('/v1/accounts').set(authHeader(userId)).expect(201);

    await request(app.getHttpServer())
      .post('/v1/accounts/me/deposits')
      .set(authHeader(userId))
      .send({ amount: '100.0000' })
      .expect(400);
  });

  it('creates a deposit and replays the same idempotency key without duplicating the effect', async () => {
    const userId = randomUUID();
    const idempotencyKey = randomUUID();

    await request(app.getHttpServer()).post('/v1/accounts').set(authHeader(userId)).expect(201);

    const firstResponse = await request(app.getHttpServer())
      .post('/v1/accounts/me/deposits')
      .set(authHeader(userId))
      .set('X-Idempotency-Key', idempotencyKey)
      .send({ amount: '100.0000' })
      .expect(201);

    expect(firstResponse.body).toEqual({
      transactionId: expect.any(String),
      amount: '100.0000',
      type: TransactionType.DEPOSIT,
      createdAt: expect.any(String),
    });

    const replayResponse = await request(app.getHttpServer())
      .post('/v1/accounts/me/deposits')
      .set(authHeader(userId))
      .set('X-Idempotency-Key', idempotencyKey)
      .send({ amount: '100.0000' })
      .expect(200);

    expect(replayResponse.body).toEqual(firstResponse.body);

    const balanceResponse = await request(app.getHttpServer()).get('/v1/accounts/me').set(authHeader(userId)).expect(200);

    expect(balanceResponse.body.balance).toBe('100.0000');

    const databaseService = app.get(DatabaseService);
    const accountId = balanceResponse.body.id as string;
    const countResult = await databaseService.pool.query<{ count: number }>(
      'select count(*)::int as count from transactions where account_id = $1',
      [accountId],
    );

    expect(countResult.rows[0]?.count).toBe(1);
  });

  it('rejects reusing an idempotency key with a different payload', async () => {
    const userId = randomUUID();
    const idempotencyKey = randomUUID();

    await request(app.getHttpServer()).post('/v1/accounts').set(authHeader(userId)).expect(201);

    await request(app.getHttpServer())
      .post('/v1/accounts/me/deposits')
      .set(authHeader(userId))
      .set('X-Idempotency-Key', idempotencyKey)
      .send({ amount: '100.0000' })
      .expect(201);

    const conflictResponse = await request(app.getHttpServer())
      .post('/v1/accounts/me/deposits')
      .set(authHeader(userId))
      .set('X-Idempotency-Key', idempotencyKey)
      .send({ amount: '200.0000' })
      .expect(409);

    expect(conflictResponse.body).toEqual({
      error: {
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key was already used with a different payload',
      },
    });

    const balanceResponse = await request(app.getHttpServer()).get('/v1/accounts/me').set(authHeader(userId)).expect(200);

    expect(balanceResponse.body.balance).toBe('100.0000');
  });

  it('converges concurrent retries with the same idempotency key into a single effect', async () => {
    const userId = randomUUID();
    const idempotencyKey = randomUUID();

    await request(app.getHttpServer()).post('/v1/accounts').set(authHeader(userId)).expect(201);

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post('/v1/accounts/me/deposits')
          .set(authHeader(userId))
          .set('X-Idempotency-Key', idempotencyKey)
          .send({ amount: '100.0000' }),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(responses.map((response) => response.body.transactionId)).size).toBe(1);

    const balanceResponse = await request(app.getHttpServer()).get('/v1/accounts/me').set(authHeader(userId)).expect(200);

    expect(balanceResponse.body.balance).toBe('100.0000');

    const databaseService = app.get(DatabaseService);
    const accountId = balanceResponse.body.id as string;
    const countResult = await databaseService.pool.query<{ count: number }>(
      'select count(*)::int as count from transactions where account_id = $1',
      [accountId],
    );

    expect(countResult.rows[0]?.count).toBe(1);
  });
});