// @flow

export type ValidationErrorData = {
  tableName: string,
  failedConstraint: 'required' | 'typeError' | 'maxValue' | 'minValue' | 'maxLength'
    | 'minLength' | 'regex' | 'unknownKey',
  badAttribute: string,
  object: {[string]: any},
}

/**
 * Error thrown when an object that is to be added to IDB fails validation
 * @extends Error
 *
 * @see validateDexieAdd
 */
class DatabaseValidationError extends Error {
  validationErrorData: ValidationErrorData;

  constructor(message: string, validationErrorData: ValidationErrorData) {
    super(message);
    this.name = 'DatabaseValidationError';
    this.validationErrorData = validationErrorData;
  }
}

export default DatabaseValidationError;
