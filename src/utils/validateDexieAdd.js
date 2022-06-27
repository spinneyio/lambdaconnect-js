// @flow

import type { ValidationSchema } from "../utils/types";
import DatabaseValidationError from "../errors/DatabaseValidationError";

type ValidateDexieAddProperties = {
  tableName: string, objectToAdd: any, validationSchema: ValidationSchema
}

const isNullish = (value) => value === undefined || value === null;

const autoAddedAttributes = ['uuid', 'active', 'createdAt', 'updatedAt'];

/**
 * @name validateDexieAdd
 *
 * @param { string } tableName - Key of IDB object store - 'NO*'
 * @param { * } objectToAdd - Object to be added to tableName
 * @param { ValidationSchema } validationSchema - JSON schema generated from data-model
 *
 * @throws { DatabaseValidationError } - Will throw if objectToAdd fails validationSchema constraint
 *
 * @see modelParser
 * @see safelyAdd
 */
export default function validateDexieAdd({ tableName, objectToAdd, validationSchema }: ValidateDexieAddProperties) {
  const selectedTableValidationSchema = validationSchema[tableName];
  const attributes = Object.keys(selectedTableValidationSchema.attributes);
  const relations = selectedTableValidationSchema.relationships ? Object.keys(selectedTableValidationSchema.relationships) : [];
  const objectAttributes = Object.keys(objectToAdd);

  attributes.forEach((attributeName) => {
    if (autoAddedAttributes.includes(attributeName)) {
      return;
    }

    const { constraints, type } = selectedTableValidationSchema.attributes[attributeName];

    if (!constraints.required &&
      (!objectAttributes.includes(attributeName) || isNullish(objectToAdd[attributeName]))
    ) {
      return;
    }

    /**
     * Throw if there is no required attribute
     */
    if (constraints.required && !objectAttributes.includes(attributeName)) {
      throw new DatabaseValidationError(
        `No required "${attributeName}" attribute in ${tableName} object`, {
          object: objectToAdd,
          failedConstraint: 'required',
          badAttribute: attributeName,
          tableName,
        })
    }

    /**
     * Throw if type of attribute doesn't match
     */
    if (typeof objectToAdd[attributeName] !== type) {
      if (type !== 'boolean' && (objectToAdd[attributeName] !== 0 || objectToAdd[attributeName] !== 1)) {
        throw new DatabaseValidationError(
          `Type of "${attributeName}" attribute is ${typeof objectToAdd[attributeName]} but needs to be ${type}`, {
            object: objectToAdd,
            failedConstraint: 'typeError',
            badAttribute: attributeName,
            tableName,
          })
      }
    }

    /**
     * Throw if maxValue constraint is not met
     */
    if (constraints.maxValue && objectToAdd[attributeName] > constraints.maxValue) {
      throw new DatabaseValidationError(
        `Value of "${attributeName}" exceeded a max value of ${constraints.maxValue} with ${objectToAdd[attributeName]}`, {
          object: objectToAdd,
          badAttribute: attributeName,
          failedConstraint: 'maxValue',
          tableName,
        })
    }

    /**
     * Throw if minValue constraint is not met
     */
    if (constraints.minValue && objectToAdd[attributeName] < constraints.minValue) {
      throw new DatabaseValidationError(
        `Value of "${attributeName}" = ${objectToAdd[attributeName]} is lower than a min value of ${constraints.minValue}`, {
          object: objectToAdd,
          badAttribute: attributeName,
          failedConstraint: 'minValue',
          tableName,
        })
    }

    /**
     * Throw if maxLength constraint is not met
     */
    if (constraints.maxLength && objectToAdd[attributeName].length > constraints.maxLength) {
      throw new DatabaseValidationError(
        `Length of "${attributeName}" exceed max length of ${constraints.maxLength} with ${objectToAdd[attributeName].length}`, {
          object: objectToAdd,
          badAttribute: attributeName,
          failedConstraint: 'maxLength',
          tableName,
        })
    }

    /**
     * Throw if minValue constraint is not met
     */
    if (constraints.minLength && objectToAdd[attributeName] < constraints.minLength) {
      throw new DatabaseValidationError(
        `Length of "${attributeName}" = ${objectToAdd[attributeName].length} is lower than a min length of ${constraints.minLength}`, {
          object: objectToAdd,
          badAttribute: attributeName,
          failedConstraint: 'minLength',
          tableName,
        })
    }

    /**
     * Throw if regex does not match
     */
    if (constraints.regex && !new RegExp(constraints.regex).test(objectToAdd[attributeName])) {
      throw new DatabaseValidationError(
        `"${attributeName}" attribute must match regular expression of ${constraints.regex}`, {
          object: objectToAdd,
          badAttribute: attributeName,
          failedConstraint: 'regex',
          tableName,
        })
    }
  });

  const allPossibleAttributes = [...relations, ...attributes];
  objectAttributes.forEach((objectAttribute) => {
    if (!allPossibleAttributes.includes(objectAttribute)) {
      throw new DatabaseValidationError(
        `"${objectAttribute}" attribute does not exist on ${tableName} object`, {
          tableName,
          object: objectToAdd,
          badAttribute: objectAttribute,
          failedConstraint: 'unknownKey',
        }
      )
    }
  })
}
