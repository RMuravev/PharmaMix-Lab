import { describe, it, expect } from 'vitest';
import { validateNumber, validateRequiredFields, validateDataset, safeDivide } from './validationService';

describe('Validation Service', () => {
  it('should validate numbers correctly', () => {
    expect(validateNumber(42, 'testField')).toBe(42);
    expect(validateNumber('123.45', 'testField')).toBe(123.45);
    expect(() => validateNumber('abc', 'testField')).toThrow();
    expect(() => validateNumber(Infinity, 'testField')).toThrow();
  });

  it('should validate required fields', () => {
    const row = { month: '2024-01', sales: 1000 };
    expect(() => validateRequiredFields(row, ['month', 'sales'], 0)).not.toThrow();
    expect(() => validateRequiredFields(row, ['month', 'missingField'], 0)).toThrow();
  });

  it('should validate datasets', () => {
    const data = [
      { month: '2024-01', sales: 1000 },
      { month: '2024-02', sales: 'invalid' }
    ];
    const res = validateDataset(data, { required: ['month', 'sales'], numeric: ['sales'] });
    expect(res.isValid).toBe(false);
    expect(res.errors.length).toBe(1);
  });

  it('should safely divide without throwing on zero denominator', () => {
    expect(safeDivide(10, 2)).toBe(5);
    expect(safeDivide(10, 0, 99)).toBe(99);
  });
});
