import { ValidationSchema } from "./types";
import DatabaseValidationError from "../errors/DatabaseValidationError";

type ValidateDexieProperties = {
  tableName: string;
  objectToAdd: any;
  checkRequired: boolean;
  validationSchema: ValidationSchema;
};

const isNullish = (value: any): value is undefined | null =>
  value === undefined || value === null;

const autoAddedAttributes = ["uuid", "active", "createdAt", "updatedAt"];
const stringType = "string";

function isNumericBoolean(value: any): value is 0 | 1 {
  return value === 0 || value === 1;
}

function isISODate(value: any): value is string {
  if (typeof value !== "string") {
    return false;
  }
  if (value.length !== 24) {
    return false;
  }
  const dateObj = new Date(value);
  return !Number.isNaN(dateObj);
}

/**
 * @name validateDexie
 *
 * @param tableName - Key of IDB object store - 'NO*'
 * @param objectToAdd - Object to be added to tableName
 * @param validationSchema - JSON schema generated from data-model
 * @param checkRequired - If true, will throw if required attribute is missing,
 * should be set to true when validating created objects and false when validating updated objects
 *
 * @throws { DatabaseValidationError } - Will throw if objectToAdd fails validationSchema constraint
 *
 * @see modelParser
 * @see safelyAdd
 */
export default function validateDexie({
  tableName,
  objectToAdd,
  validationSchema,
  checkRequired,
}: ValidateDexieProperties) {
  const selectedTableValidationSchema = validationSchema[tableName];
  const modelAttributes = Object.keys(
    selectedTableValidationSchema?.attributes ?? {},
  );
  const objectAttributes = Object.keys(objectToAdd);

  modelAttributes.forEach((modelAttributeName) => {
    /**
     * Skip auto added attributes
     */
    if (autoAddedAttributes.includes(modelAttributeName)) {
      return;
    }

    const { constraints, type } =
      selectedTableValidationSchema?.attributes[modelAttributeName] ?? {};
    const attributeValue = objectToAdd[modelAttributeName];

    /**
     * Keep TS happy
     */
    if (!constraints || !type) {
      return;
    }

    if (
      !constraints.required &&
      (!objectAttributes.includes(modelAttributeName) ||
        isNullish(attributeValue))
    ) {
      return;
    }

    /**
     * Throw if there is no required attribute
     */
    if (
      checkRequired &&
      constraints.required &&
      !objectAttributes.includes(modelAttributeName)
    ) {
      throw new DatabaseValidationError(
        `No required "${modelAttributeName}" attribute in ${tableName} object`,
        {
          object: objectToAdd,
          failedConstraint: "required",
          badAttribute: modelAttributeName,
          tableName,
        },
      );
    }

    /**
     * Throw if type of attribute doesn't match
     */
    if (typeof attributeValue !== type) {
      if (type === "boolean" || type === "date") {
        if (type === "boolean" && !isNumericBoolean(attributeValue)) {
          throw new DatabaseValidationError(
            `Type of "${modelAttributeName}" attribute is ${typeof attributeValue} but needs to be ${type}`,
            {
              object: objectToAdd,
              failedConstraint: "typeError",
              badAttribute: modelAttributeName,
              tableName,
            },
          );
        }
        if (type === "date" && !isISODate(attributeValue)) {
          throw new DatabaseValidationError(
            `Type of "${modelAttributeName}" attribute is ${typeof attributeValue} but needs to be ${type}`,
            {
              object: objectToAdd,
              failedConstraint: "typeError",
              badAttribute: modelAttributeName,
              tableName,
            },
          );
        }
      } else {
        throw new DatabaseValidationError(
          `Type of "${modelAttributeName}" attribute is ${typeof attributeValue} but needs to be ${type}`,
          {
            object: objectToAdd,
            failedConstraint: "typeError",
            badAttribute: modelAttributeName,
            tableName,
          },
        );
      }
    }

    /**
     * Throw if maxValue constraint is not met
     */
    if (constraints.maxValue && attributeValue > constraints.maxValue) {
      throw new DatabaseValidationError(
        `Value of "${modelAttributeName}" exceeded a max value of ${constraints.maxValue} with ${attributeValue}`,
        {
          object: objectToAdd,
          badAttribute: modelAttributeName,
          failedConstraint: "maxValue",
          tableName,
        },
      );
    }

    /**
     * Throw if minValue constraint is not met
     */
    if (constraints.minValue && attributeValue < constraints.minValue) {
      throw new DatabaseValidationError(
        `Value of "${modelAttributeName}" = ${attributeValue} is lower than a min value of ${constraints.minValue}`,
        {
          object: objectToAdd,
          badAttribute: modelAttributeName,
          failedConstraint: "minValue",
          tableName,
        },
      );
    }

    /**
     * Throw if maxLength constraint is not met
     */
    if (
      constraints.maxLength &&
      attributeValue.length > constraints.maxLength
    ) {
      throw new DatabaseValidationError(
        `Length of "${modelAttributeName}" exceed max length of ${constraints.maxLength} with ${attributeValue.length}`,
        {
          object: objectToAdd,
          badAttribute: modelAttributeName,
          failedConstraint: "maxLength",
          tableName,
        },
      );
    }

    /**
     * Throw if minValue constraint is not met
     */
    if (constraints.minLength && attributeValue < constraints.minLength) {
      throw new DatabaseValidationError(
        `Length of "${modelAttributeName}" = ${attributeValue.length} is lower than a min length of ${constraints.minLength}`,
        {
          object: objectToAdd,
          badAttribute: modelAttributeName,
          failedConstraint: "minLength",
          tableName,
        },
      );
    }

    /**
     * Throw if regex does not match
     */
    if (
      constraints.regex &&
      !new RegExp(constraints.regex).test(attributeValue)
    ) {
      throw new DatabaseValidationError(
        `"${modelAttributeName}" attribute must match regular expression of ${constraints.regex}`,
        {
          object: objectToAdd,
          badAttribute: modelAttributeName,
          failedConstraint: "regex",
          tableName,
        },
      );
    }
  });

  /**
   * Validate relationships of added object
   * All relations are marked as optional in the data model
   * As such all relationFields should accept `null` or `undefined`
   * Type of relationField should be `string` or `string[]` depending on the`toMany` property in the validation schema
   */

  const relationFields = selectedTableValidationSchema?.relationships
    ? Object.keys(selectedTableValidationSchema.relationships)
    : [];

  if (relationFields.length) {
    for (const relationField of relationFields) {
      const isToMany =
        !!selectedTableValidationSchema?.relationships?.[relationField]?.toMany;

      if (
        objectAttributes.includes(relationField) &&
        !isNullish(objectToAdd[relationField])
      ) {
        const relationFieldValue = objectToAdd[relationField];

        if (isToMany) {
          if (!Array.isArray(relationFieldValue)) {
            throw new DatabaseValidationError(
              `"${relationField}" attribute is a toMany relationship but is not an array`,
              {
                tableName,
                object: objectToAdd,
                badAttribute: relationField,
                failedConstraint: "toMany",
              },
            );
          }

          for (const relationValue of relationFieldValue) {
            if (typeof relationValue !== stringType) {
              throw new DatabaseValidationError(
                `"${relationField}" attribute is a toMany relationship but contains a non-string value`,
                {
                  tableName,
                  object: objectToAdd,
                  badAttribute: relationField,
                  failedConstraint: "toMany",
                },
              );
            }
          }
        }

        if (!isToMany) {
          if (Array.isArray(relationFieldValue)) {
            throw new DatabaseValidationError(
              `"${relationField}" attribute is a toOne relationship but is an array`,
              {
                tableName,
                object: objectToAdd,
                badAttribute: relationField,
                failedConstraint: "toOne",
              },
            );
          }

          if (typeof relationFieldValue !== stringType) {
            throw new DatabaseValidationError(
              `"${relationField}" attribute is a toOne relationship but contains a non-string value`,
              {
                tableName,
                object: objectToAdd,
                badAttribute: relationField,
                failedConstraint: "toOne",
              },
            );
          }
        }
      }
    }
  }

  const allPossibleAttributes = [...relationFields, ...modelAttributes];

  objectAttributes.forEach((objectAttribute) => {
    if (!allPossibleAttributes.includes(objectAttribute)) {
      throw new DatabaseValidationError(
        `"${objectAttribute}" attribute does not exist on ${tableName} object`,
        {
          tableName,
          object: objectToAdd,
          badAttribute: objectAttribute,
          failedConstraint: "unknownKey",
        },
      );
    }
  });
}
