/**
 * Validation Service for PharmaMix Lab.
 * Handles data integrity checks for CSV uploads and mathematical computations.
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates numerical inputs to prevent NaN or Infinity propagation.
 */
export function validateNumber(value: any, fieldName: string): number {
  const num = Number(value);
  if (isNaN(num)) {
    throw new Error(`Data Validation Error: "${fieldName}" must be a number, but received "${value}".`);
  }
  if (!isFinite(num)) {
    throw new Error(`Data Validation Error: "${fieldName}" is infinite.`);
  }
  return num;
}

/**
 * Checks for missing required fields in a row of data.
 */
export function validateRequiredFields(row: any, requiredFields: string[], rowIndex: number): void {
  for (const field of requiredFields) {
    if (row[field] === undefined || row[field] === null || row[field] === '') {
      throw new Error(`Data Validation Error: Missing required field "${field}" at row ${rowIndex + 1}.`);
    }
  }
}

/**
 * Validates a dataset for common PharmaMix requirements.
 */
export function validateDataset(data: any[], schema: { required: string[], numeric: string[] }): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  if (!Array.isArray(data) || data.length === 0) {
    result.isValid = false;
    result.errors.push('The dataset is empty or invalid.');
    return result;
  }

  data.forEach((row, index) => {
    try {
      validateRequiredFields(row, schema.required, index);
      schema.numeric.forEach(field => {
        if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
          validateNumber(row[field], field);
        }
      });
    } catch (err: any) {
      result.isValid = false;
      result.errors.push(err.message);
    }
  });

  return result;
}

/**
 * Prevents zero-division and other math errors in calculations.
 */
export function safeDivide(numerator: number, denominator: number, fallback: number = 0): number {
  if (denominator === 0 || isNaN(denominator)) return fallback;
  const res = numerator / denominator;
  return isFinite(res) ? res : fallback;
}
