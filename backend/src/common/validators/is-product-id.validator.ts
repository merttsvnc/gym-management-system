import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Regex for CUID (25 chars, starts with 'c') or UUID v4 format.
 * Products use CUID; legacy or external systems may use UUID.
 */
export const PRODUCT_ID_OR_UUID_REGEX =
  /^(c[a-z0-9]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * Validates that a string is either CUID (25 chars) or UUID v4 format.
 * Use for productId fields where Products API returns CUIDs.
 */
export function IsProductIdOrUuid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isProductIdOrUuid',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, _args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          return PRODUCT_ID_OR_UUID_REGEX.test(value);
        },
        defaultMessage(_args: ValidationArguments) {
          return 'productId must be either CUID or UUID format';
        },
      },
    });
  };
}
