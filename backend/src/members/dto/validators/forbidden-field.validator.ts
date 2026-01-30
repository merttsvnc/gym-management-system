import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Custom validator that rejects a field if it's present (not undefined)
 * Used for fields that are explicitly forbidden in certain contexts (e.g., v1 API restrictions)
 */
export function IsForbidden(
  message: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isForbidden',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          // Fail only if field is present (not undefined)
          // If undefined, validation passes (field not sent)
          return value === undefined;
        },
        defaultMessage(args: ValidationArguments) {
          return message;
        },
      },
    });
  };
}
