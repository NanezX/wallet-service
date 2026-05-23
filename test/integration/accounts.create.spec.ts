import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';

import { configureApp } from 'src/bootstrap';
import { TransactionType } from 'src/common/transactions/transaction-type';
import { DatabaseService } from 'src/db/database.service';
import { runMigrations } from 'src/db/migrate';
import { transactions } from 'src/db/schema';
import { authHeader } from 'test/helpers/jwt';

describe('Accounts endpoints', () => {
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

  it('returns 401 when the caller has no JWT', async () => {
    await request(app.getHttpServer()).post('/v1/accounts').expect(401);
  });

  it('creates an account for the JWT subject and rejects the second attempt', async () => {
    const userId = randomUUID();

    const firstResponse = await request(app.getHttpServer())
      .post('/v1/accounts')
      .set(authHeader(userId))
      .expect(201);

    expect(firstResponse.body).toEqual({
      id: expect.any(String),
      balance: '0.0000',
      createdAt: expect.any(String),
    });

    const secondResponse = await request(app.getHttpServer())
      .post('/v1/accounts')
      .set(authHeader(userId))
      .expect(409);

    expect(secondResponse.body).toEqual({
      error: {
        code: 'ACCOUNT_ALREADY_EXISTS',
        message: 'Account already exists',
      },
    });
  });

  it('returns the caller account for GET /v1/accounts/me', async () => {
    const userId = randomUUID();

    const createResponse = await request(app.getHttpServer())
      .post('/v1/accounts')
      .set(authHeader(userId))
      .expect(201);

    const getResponse = await request(app.getHttpServer())
      .get('/v1/accounts/me')
      .set(authHeader(userId))
      .expect(200);

    expect(getResponse.body).toEqual(createResponse.body);
  });

  it('returns an empty history for a new account', async () => {
    const userId = randomUUID();

    await request(app.getHttpServer()).post('/v1/accounts').set(authHeader(userId)).expect(201);

    const response = await request(app.getHttpServer())
      .get('/v1/accounts/me/transactions')
      .set(authHeader(userId))
      .expect(200);

    expect(response.body).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('paginates the caller history with a cursor', async () => {
    const userId = randomUUID();

    const createResponse = await request(app.getHttpServer())
      .post('/v1/accounts')
      .set(authHeader(userId))
      .expect(201);

    const databaseService = app.get(DatabaseService);
    const accountId = createResponse.body.id as string;

    const oldestId = randomUUID();
    const middleId = randomUUID();
    const newestId = randomUUID();

    await databaseService.db.insert(transactions).values([
      {
        id: oldestId,
        accountId,
        amount: '10.0000',
        type: TransactionType.DEPOSIT,
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      },
      {
        id: middleId,
        accountId,
        amount: '20.0000',
        type: TransactionType.DEPOSIT,
        createdAt: new Date('2026-01-01T11:00:00.000Z'),
      },
      {
        id: newestId,
        accountId,
        amount: '30.0000',
        type: TransactionType.DEPOSIT,
        createdAt: new Date('2026-01-01T12:00:00.000Z'),
      },
    ]);

    const firstPage = await request(app.getHttpServer())
      .get('/v1/accounts/me/transactions?limit=2')
      .set(authHeader(userId))
      .expect(200);

    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.items.map((item: { id: string }) => item.id)).toEqual([newestId, middleId]);
    expect(firstPage.body.nextCursor).toEqual(expect.any(String));

    const secondPage = await request(app.getHttpServer())
      .get(`/v1/accounts/me/transactions?limit=2&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`)
      .set(authHeader(userId))
      .expect(200);

    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.items.map((item: { id: string }) => item.id)).toEqual([oldestId]);
    expect(secondPage.body.nextCursor).toBeNull();
  });
});