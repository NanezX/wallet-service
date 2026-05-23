import { sql } from 'drizzle-orm';
import { check, index, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const transactionTypes = ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER_OUT', 'TRANSFER_IN'] as const;

export type TransactionType = (typeof transactionTypes)[number];

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
      sql`${table.type} IN ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER_OUT', 'TRANSFER_IN')`,
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
