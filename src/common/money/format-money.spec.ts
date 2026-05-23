import { formatMoney } from './format-money';

describe('formatMoney', () => {
  it('pads an integer to 4 decimal places', () => {
    expect(formatMoney('100')).toBe('100.0000');
  });

  it('pads 1 decimal place to 4', () => {
    expect(formatMoney('50.5')).toBe('50.5000');
  });

  it('pads 2 decimal places to 4', () => {
    expect(formatMoney('9.99')).toBe('9.9900');
  });

  it('pads 3 decimal places to 4', () => {
    expect(formatMoney('1.123')).toBe('1.1230');
  });

  it('leaves 4 decimal places unchanged', () => {
    expect(formatMoney('1.1234')).toBe('1.1234');
  });

  it('handles zero', () => {
    expect(formatMoney('0')).toBe('0.0000');
  });

  it('preserves a large integer', () => {
    expect(formatMoney('9999999999')).toBe('9999999999.0000');
  });
});
