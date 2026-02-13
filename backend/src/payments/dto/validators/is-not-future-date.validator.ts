import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Custom validator to ensure a date string is not in the future
 * Used for paidOn field validation (DATE-ONLY business date)
 */
export function IsNotFutureDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNotFutureDate',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (!value) {
            return true; // Let @IsDateString handle empty values
          }

          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            return false; // Invalid date
          }

          // Get today's date at start of day (UTC)
          const today = new Date();
          today.setUTCHours(0, 0, 0, 0);

          // Compare dates (only date part, ignore time)
          const inputDate = new Date(date);
          inputDate.setUTCHours(0, 0, 0, 0);

          // Date should not be in the future
          return inputDate <= today;
        },

        defaultMessage(_args: ValidationArguments) {
          return 'Ödeme tarihi gelecekte olamaz';
        },
      },
    });
  };
}
