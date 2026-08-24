import { ValidationError } from 'class-validator';
import { ErrorDetail } from '../constants/error-codes';

export function flattenValidationErrors(
  errors: ValidationError[],
  parent?: string,
): ErrorDetail[] {
  const details: ErrorDetail[] = [];

  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      for (const issue of Object.values(error.constraints)) {
        details.push({ field, issue });
      }
    }
    if (error.children && error.children.length > 0) {
      details.push(...flattenValidationErrors(error.children, field));
    }
  }

  return details;
}
