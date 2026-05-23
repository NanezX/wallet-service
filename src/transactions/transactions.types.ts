import { TransactionType } from '../common/transactions/transaction-type';

type WriteTransactionResponse<TType extends TransactionType.DEPOSIT | TransactionType.WITHDRAWAL> = {
  transactionId: string;
  amount: string;
  type: TType;
  createdAt: string;
};

export type DepositResponse = WriteTransactionResponse<TransactionType.DEPOSIT>;

export type WithdrawalResponse = WriteTransactionResponse<TransactionType.WITHDRAWAL>;

export type TransferResponse = {
  transferId: string;
  amount: string;
  destinationAccountId: string;
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
