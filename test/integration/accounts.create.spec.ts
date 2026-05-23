import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { configureApp } from 'src/bootstrap';
import { runMigrations } from 'src/db/migrate';

function authHeader(userId: string): { Authorization: string } {
  const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET ?? 'test-secret', {
    expiresIn: '1h',
  });

  return {
    Authorization: `Bearer ${token}`,
  };
}

describe('POST /v1/accounts', () => {
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
});