// @flow

import type { ValidationSchema } from "../utils/types";
import DatabaseValidationError from "../errors/DatabaseValidationError";

type ValidateDexieAddProperties = {
  tableName: string, objectToAdd: any, validationSchema: ValidationSchema
}

const isNullish = (value) => value === undefined || value === null;

const autoAddedAttributes = ['uuid', 'active', 'createdAt', 'updatedAt'];


function isNumericBoolean(value) {
  return value === 0 || value === 1;
}

function isISODate(value) {
  if (typeof value !== 'string') {
    return false;
  }
  if (value.length !== 24) {
    return false;
  }
  const dateObj = new Date(value);
  return !Number.isNaN(dateObj);
}


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
    const attributeValue = objectToAdd[attributeName];

    if (!constraints.required &&
      (!objectAttributes.includes(attributeName) || isNullish(attributeValue))
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
    if (typeof attributeValue !== type) {
      if (type === 'boolean' || type === 'date') {
        if (type === 'boolean' && !isNumericBoolean(attributeValue)) {
          throw new DatabaseValidationError(
            `Type of "${attributeName}" attribute is ${typeof attributeValue} but needs to be ${type}`, {
              object: objectToAdd,
              failedConstraint: 'typeError',
              badAttribute: attributeName,
              tableName,
            })
        }
        if (type === 'date' && !isISODate(attributeValue)) {
          throw new DatabaseValidationError(
            `Type of "${attributeName}" attribute is ${typeof attributeValue} but needs to be ${type}`, {
              object: objectToAdd,
              failedConstraint: 'typeError',
              badAttribute: attributeName,
              tableName,
            })
        }
      } else {
        throw new DatabaseValidationError(
          `Type of "${attributeName}" attribute is ${typeof attributeValue} but needs to be ${type}`, {
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
    if (constraints.maxValue && attributeValue > constraints.maxValue) {
      throw new DatabaseValidationError(
        `Value of "${attributeName}" exceeded a max value of ${constraints.maxValue} with ${attributeValue}`, {
          object: objectToAdd,
          badAttribute: attributeName,
          failedConstraint: 'maxValue',
          tableName,
        })
    }

    /**
     * Throw if minValue constraint is not met
     */
    if (constraints.minValue && attributeValue < constraints.minValue) {
      throw new DatabaseValidationError(
        `Value of "${attributeName}" = ${attributeValue} is lower than a min value of ${constraints.minValue}`, {
          object: objectToAdd,
          badAttribute: attributeName,
          failedConstraint: 'minValue',
          tableName,
        })
    }

    /**
     * Throw if maxLength constraint is not met
     */
    if (constraints.maxLength && attributeValue.length > constraints.maxLength) {
      throw new DatabaseValidationError(
        `Length of "${attributeName}" exceed max length of ${constraints.maxLength} with ${attributeValue.length}`, {
          object: objectToAdd,
          badAttribute: attributeName,
          failedConstraint: 'maxLength',
          tableName,
        })
    }

    /**
     * Throw if minValue constraint is not met
     */
    if (constraints.minLength && attributeValue < constraints.minLength) {
      throw new DatabaseValidationError(
        `Length of "${attributeName}" = ${attributeValue.length} is lower than a min length of ${constraints.minLength}`, {
          object: objectToAdd,
          badAttribute: attributeName,
          failedConstraint: 'minLength',
          tableName,
        })
    }

    /**
     * Throw if regex does not match
     */
    if (constraints.regex && !new RegExp(constraints.regex).test(attributeValue)) {
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
