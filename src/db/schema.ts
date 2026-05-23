import { sql } from 'drizzle-orm';
import { check, index, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import {
  negativeTransactionTypes,
  positiveTransactionTypes,
  TransactionType,
  transactionTypes,
} from '../common/transactions/transaction-type';

// Estos CHECKs viven en la DB, no en TypeScript. Drizzle necesita fragmentos SQL
// para armar los IN (...), así que convertimos una sola vez las listas compartidas
// del enum y evitamos duplicar los literales entre el código de dominio y el schema.
const toSqlStringLiteral = (value: string) => sql.raw(`'${value}'`);
const transactionTypeSqlList = sql.join(transactionTypes.map(toSqlStringLiteral), sql.raw(', '));
const positiveTransactionTypeSqlList = sql.join(positiveTransactionTypes.map(toSqlStringLiteral), sql.raw(', '));
const negativeTransactionTypeSqlList = sql.join(negativeTransactionTypes.map(toSqlStringLiteral), sql.raw(', '));

export { TransactionType, transactionTypes };

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().unique(),
    balance: numeric('balance', { precision: 20, scale: 4 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('accounts_balance_non_negative', sql`${table.balance} >= 0`)],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    amount: numeric('amount', { precision: 20, scale: 4 }).notNull(),
    type: text('type').notNull(),
    idempotencyKey: uuid('idempotency_key'),
    transferId: uuid('transfer_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('transactions_amount_non_zero', sql`${table.amount} <> 0`),
    check(
      'transactions_type_valid',
      sql`${table.type} IN (${transactionTypeSqlList})`,
    ),
    check(
      'transactions_amount_sign_matches_type',
      sql`(
        (${table.type} IN (${positiveTransactionTypeSqlList}) AND ${table.amount} > 0)
        OR
        (${table.type} IN (${negativeTransactionTypeSqlList}) AND ${table.amount} < 0)
      )`,
    ),
    uniqueIndex('idx_transactions_idempotency_key')
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    index('idx_transactions_account_created').on(table.accountId, table.createdAt.desc(), table.id.desc()),
    index('idx_transactions_transfer_id').on(table.transferId).where(sql`${table.transferId} IS NOT NULL`),
  ],
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
