CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"balance" numeric(20, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "accounts_balance_non_negative" CHECK ("accounts"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"type" text NOT NULL,
	"idempotency_key" uuid,
	"transfer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_amount_non_zero" CHECK ("transactions"."amount" <> 0),
	CONSTRAINT "transactions_type_valid" CHECK ("transactions"."type" IN ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER_OUT', 'TRANSFER_IN'))
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_transactions_idempotency_key" ON "transactions" USING btree ("idempotency_key") WHERE "transactions"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_transactions_account_created" ON "transactions" USING btree ("account_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_transactions_transfer_id" ON "transactions" USING btree ("transfer_id") WHERE "transactions"."transfer_id" IS NOT NULL;