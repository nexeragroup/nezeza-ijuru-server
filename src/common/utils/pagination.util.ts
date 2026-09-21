export interface PaginationOptions {
  readonly page?: number;
  readonly limit?: number;
}

export interface NormalizedPagination {
  readonly page: number;
  readonly limit: number;

  readonly skip: number;
  readonly take: number;
}

export interface PaginatedResponse<T> {
  readonly data: T[];

  readonly total: number;

  readonly page: number;
  readonly limit: number;

  readonly totalPages: number;

  readonly hasPreviousPage: boolean;
  readonly hasNextPage: boolean;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const DEFAULT_MAXIMUM_LIMIT = 100;

export const normalizePagination = (
  options: PaginationOptions = {},
  maximumLimit = DEFAULT_MAXIMUM_LIMIT,
): NormalizedPagination => {
  assertPositiveSafeInteger(maximumLimit, 'maximumLimit');

  const page = normalizePositiveInteger(options.page, DEFAULT_PAGE);

  const requestedLimit = normalizePositiveInteger(options.limit, DEFAULT_LIMIT);

  const limit = Math.min(requestedLimit, maximumLimit);

  const skip = (page - 1) * limit;

  if (!Number.isSafeInteger(skip)) {
    throw new RangeError(
      'Pagination offset exceeds the JavaScript safe integer range',
    );
  }

  return {
    page,
    limit,
    skip,
    take: limit,
  };
};

export const toPaginatedResponse = <T>(
  [data, total]: readonly [T[], number],

  pagination: Pick<NormalizedPagination, 'page' | 'limit'>,
): PaginatedResponse<T> => {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new TypeError('Pagination total must be a non-negative safe integer');
  }

  assertPositiveSafeInteger(pagination.page, 'pagination.page');

  assertPositiveSafeInteger(pagination.limit, 'pagination.limit');

  const totalPages = total === 0 ? 0 : Math.ceil(total / pagination.limit);

  return {
    data,

    total,

    page: pagination.page,

    limit: pagination.limit,

    totalPages,

    hasPreviousPage: pagination.page > 1,

    hasNextPage: pagination.page < totalPages,
  };
};

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.trunc(value);

  if (normalized <= 0) {
    return fallback;
  }

  if (!Number.isSafeInteger(normalized)) {
    return fallback;
  }

  return normalized;
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
}
