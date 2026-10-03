const MONEY_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Converts a two-decimal monetary string to minor units.
 *
 * Examples:
 *
 * "10.25" -> 1025n
 * "10"    -> 1000n
 * "-1.50" -> -150n
 */
export const parseMoneyToMinorUnits = (value: string): bigint => {
  if (typeof value !== 'string') {
    throw new TypeError('Money value must be a string');
  }

  const normalized = value.trim();

  const match = MONEY_PATTERN.exec(normalized);

  if (!match) {
    throw new TypeError(`Invalid monetary value "${value}"`);
  }

  const [, sign, whole, fraction = ''] = match;

  const minorUnits = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));

  return sign === '-' ? -minorUnits : minorUnits;
};

/**
 * Formats minor monetary units as a two-decimal string.
 */
export const formatMinorUnits = (value: bigint): string => {
  const negative = value < 0n;

  const absolute = negative ? -value : value;

  const whole = absolute / 100n;

  const fraction = (absolute % 100n).toString().padStart(2, '0');

  return `${negative ? '-' : ''}${whole}.${fraction}`;
};

/**
 * Multiplies two-decimal money by an integer quantity
 * without floating-point arithmetic.
 */
export const multiplyMoney = (
  unitPrice: string,
  quantity: number | bigint,
): string => {
  const normalizedQuantity = normalizeQuantity(quantity);

  const unitMinor = parseMoneyToMinorUnits(unitPrice);

  return formatMinorUnits(unitMinor * normalizedQuantity);
};

function normalizeQuantity(quantity: number | bigint): bigint {
  if (typeof quantity === 'bigint') {
    return quantity;
  }

  if (!Number.isSafeInteger(quantity)) {
    throw new TypeError('Quantity must be a safe integer');
  }

  return BigInt(quantity);
}

/**
 * @deprecated
 *
 * Do not use number-based rounding for persisted accounting
 * calculations. Prefer minor units or decimal strings.
 *
 * This helper should only be used for display/non-critical
 * numeric calculations.
 */
export const roundMoney = (value: number): number => {
  if (!Number.isFinite(value)) {
    throw new TypeError('Money value must be finite');
  }

  if (Math.abs(value) > Number.MAX_SAFE_INTEGER / 100) {
    throw new RangeError('Money value exceeds safe numeric range');
  }

  const rounded =
    (Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100)) /
    100;

  return Object.is(rounded, -0) ? 0 : rounded;
};
