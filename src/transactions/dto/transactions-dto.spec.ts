import 'reflect-metadata';

import { validateSync } from 'class-validator';

import { CreateDepositDto } from './create-deposit.dto';
import { CreateTransferDto } from './create-transfer.dto';
import { CreateWithdrawalDto } from './create-withdrawal.dto';

describe('transaction DTO validation', () => {
  describe('CreateDepositDto', () => {
    it('accepts a positive decimal string with up to 4 decimal places', () => {
      expect(validateDto(CreateDepositDto, { amount: '100.1234' })).toEqual([]);
    });

    it('rejects a negative amount', () => {
      expect(validateDto(CreateDepositDto, { amount: '-1.0000' })).toContain(
        'amount must be a positive decimal string with up to 4 decimal places',
      );
    });

    it('rejects more than 4 decimal places', () => {
      expect(validateDto(CreateDepositDto, { amount: '1.12345' })).toContain(
        'amount must be a positive decimal string with up to 4 decimal places',
      );
    });
  });

  describe('CreateWithdrawalDto', () => {
    it('accepts a positive decimal string with up to 4 decimal places', () => {
      expect(validateDto(CreateWithdrawalDto, { amount: '50.5000' })).toEqual([]);
    });

    it('rejects a negative amount', () => {
      expect(validateDto(CreateWithdrawalDto, { amount: '-10.0000' })).toContain(
        'amount must be a positive decimal string with up to 4 decimal places',
      );
    });

    it('rejects more than 4 decimal places', () => {
      expect(validateDto(CreateWithdrawalDto, { amount: '0.00001' })).toContain(
        'amount must be a positive decimal string with up to 4 decimal places',
      );
    });
  });

  describe('CreateTransferDto', () => {
    it('accepts a valid payload', () => {
      expect(
        validateDto(CreateTransferDto, {
          amount: '25.0000',
          destination_account_id: '550e8400-e29b-41d4-a716-446655440000',
        }),
      ).toEqual([]);
    });

    it('rejects an invalid destination UUID', () => {
      expect(
        validateDto(CreateTransferDto, {
          amount: '25.0000',
          destination_account_id: 'not-a-uuid',
        }),
      ).toContain('destination_account_id must be a UUID');
    });

    it('rejects a negative amount', () => {
      expect(
        validateDto(CreateTransferDto, {
          amount: '-25.0000',
          destination_account_id: '550e8400-e29b-41d4-a716-446655440000',
        }),
      ).toContain('amount must be a positive decimal string with up to 4 decimal places');
    });
  });
});

function validateDto<T extends object>(
  DtoClass: new () => T,
  payload: Partial<T>,
): string[] {
  const dto = Object.assign(new DtoClass(), payload);

  return validateSync(dto)
    .flatMap((error) => Object.values(error.constraints ?? {}));
}