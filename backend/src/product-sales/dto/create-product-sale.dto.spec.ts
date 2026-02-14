import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SaleItemDto } from './create-product-sale.dto';

describe('SaleItemDto - productId validation', () => {
  const validCuid = 'cmllx1luq0002a6jm2lxohg78';
  const validUuid = '550e8400-e29b-41d4-a716-446655440000';

  async function validateItem(obj: object): Promise<string[]> {
    const dto = plainToInstance(SaleItemDto, obj);
    const errors = await validate(dto, { whitelist: true });
    return errors.flatMap((e) =>
      (e.constraints ? Object.values(e.constraints) : []).map(
        (m) => `${e.property}: ${m}`,
      ),
    );
  }

  it('should accept CUID format productId', async () => {
    const errors = await validateItem({
      productId: validCuid,
      quantity: 1,
    });
    expect(errors).toHaveLength(0);
  });

  it('should accept UUID format productId', async () => {
    const errors = await validateItem({
      productId: validUuid,
      quantity: 1,
    });
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid productId format', async () => {
    const errors = await validateItem({
      productId: 'product-1',
      quantity: 1,
    });
    expect(errors.some((e) => e.includes('productId'))).toBe(true);
    expect(errors.some((e) => e.includes('CUID or UUID'))).toBe(true);
  });

  it('should reject empty string productId', async () => {
    const errors = await validateItem({
      productId: '',
      quantity: 1,
    });
    expect(errors.some((e) => e.includes('productId'))).toBe(true);
  });

  it('should reject too-short CUID-like string', async () => {
    const errors = await validateItem({
      productId: 'c123',
      quantity: 1,
    });
    expect(errors.some((e) => e.includes('productId'))).toBe(true);
  });

  it('should accept customName without productId (custom item)', async () => {
    const errors = await validateItem({
      customName: 'Custom Product',
      quantity: 1,
      unitPrice: 50,
    });
    expect(errors).toHaveLength(0);
  });
});
