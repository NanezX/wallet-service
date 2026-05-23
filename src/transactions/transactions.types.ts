import { TransactionType } from '../common/transactions/transaction-type';

export type DepositResponse = {
  transactionId: string;
  amount: string;
  type: TransactionType.DEPOSIT;
  createdAt: string;
};

export type TransactionHistoryItem = {
  id: string;
  amount: string;
  type: TransactionType;
  transferId: string | null;
  createdAt: string;
};

export type TransactionHistoryResponse = {
  items: TransactionHistoryItem[];
  nextCursor: string | null;
};
