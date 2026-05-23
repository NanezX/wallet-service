ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_sign_matches_type" CHECK ((
        ("transactions"."type" IN ('DEPOSIT', 'TRANSFER_IN') AND "transactions"."amount" > 0)
        OR
        ("transactions"."type" IN ('WITHDRAWAL', 'TRANSFER_OUT') AND "transactions"."amount" < 0)
      ));