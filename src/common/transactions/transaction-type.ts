export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  TRANSFER_OUT = 'TRANSFER_OUT',
  TRANSFER_IN = 'TRANSFER_IN',
}

export const transactionTypes = [
  TransactionType.DEPOSIT,
  TransactionType.WITHDRAWAL,
  TransactionType.TRANSFER_OUT,
  TransactionType.TRANSFER_IN,
] as const;

export const positiveTransactionTypes = [TransactionType.DEPOSIT, TransactionType.TRANSFER_IN] as const;

export const negativeTransactionTypes = [TransactionType.WITHDRAWAL, TransactionType.TRANSFER_OUT] as const;