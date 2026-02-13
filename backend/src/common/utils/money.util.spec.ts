import { Prisma } from '@prisma/client';
import { toMoneyString } from './money.util';

describe('toMoneyString', () => {
  it('should format Prisma.Decimal with 2 decimal places', () => {
    const decimal = new Prisma.Decimal('123.456');
    expect(toMoneyString(decimal)).toBe('123.46');
  });

  it('should format Prisma.Decimal with rounding', () => {
    const decimal = new Prisma.Decimal('123.455');
    expect(toMoneyString(decimal)).toBe('123.46');
  });

  it('should format number with 2 decimal places', () => {
    expect(toMoneyString(123.456)).toBe('123.46');
  });

  it('should format string number with 2 decimal places', () => {
    expect(toMoneyString('123.456')).toBe('123.46');
  });

  it('should format whole numbers with 2 decimal places', () => {
    expect(toMoneyString(123)).toBe('123.00');
  });

  it('should handle zero', () => {
    expect(toMoneyString(0)).toBe('0.00');
  });

  it('should handle null as 0.00', () => {
    expect(toMoneyString(null)).toBe('0.00');
  });

  it('should handle undefined as 0.00', () => {
    expect(toMoneyString(undefined)).toBe('0.00');
  });

  it('should handle negative numbers', () => {
    expect(toMoneyString(-123.456)).toBe('-123.46');
  });

  it('should handle very small decimals', () => {
    expect(toMoneyString(0.001)).toBe('0.00');
  });

  it('should handle large numbers', () => {
    expect(toMoneyString(999999.999)).toBe('1000000.00');
  });

  it('should handle string with many decimal places', () => {
    expect(toMoneyString('123.4567890')).toBe('123.46');
  });
});
