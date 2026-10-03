import {
  BadRequestException,
  type PipeTransform,
  type Type,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

export class BulkCreatePipe<T extends object> implements PipeTransform<
  unknown,
  Promise<T[]>
> {
  constructor(private readonly dto: Type<T>) {}

  async transform(value: unknown): Promise<T[]> {
    if (!Array.isArray(value)) {
      throw new BadRequestException('Expected an array of items');
    }

    const items = plainToInstance(this.dto, value);
    const errors = await Promise.all(
      items.map((item) =>
        validate(item, {
          whitelist: true,
          forbidNonWhitelisted: true,
          forbidUnknownValues: true,
          validationError: {
            target: false,
            value: false,
          },
        }),
      ),
    );

    const invalidItem = errors.findIndex((itemErrors) => itemErrors.length > 0);

    if (invalidItem !== -1) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: `Bulk item ${invalidItem + 1} is invalid`,
        errors: errors[invalidItem],
      });
    }

    return items;
  }
}
