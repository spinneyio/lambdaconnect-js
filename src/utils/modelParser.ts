import parser from "fast-xml-parser";
import he from "he";
import {
  Constraints,
  DatabaseModel,
  DatabaseModelEntity,
  DatabaseModelEntityAttribute,
  RawAttribute,
  RawEntity,
  Type,
  ValidationSchema,
} from "./types";

const options = {
  attributeNamePrefix: "",
  attrNodeName: "attr", //default is 'false'
  textNodeName: "#text",
  ignoreAttributes: false,
  ignoreNameSpace: false,
  allowBooleanAttributes: true,
  parseNodeValue: true,
  parseAttributeValue: true,
  trimValues: true,
  parseTrueNumberOnly: false,
  arrayMode: false, //"strict"
  // @ts-ignore
  attrValueProcessor: (val, attrName) =>
    he.decode(val, { isAttributeValue: true }), //default is a=>a
  // @ts-ignore
  tagValueProcessor: (val, tagName) => he.decode(val), //default is a=>a
  stopNodes: ["element", "elements"],
};

const numberTypes = [
  "Double",
  "Integer 64",
  "Integer 16",
  "Integer 32",
  "Float",
];
const stringTypes = ["String", "UUID", "URI"];

/**
 * Get constraints and type of attribute for validation schema
 *
 * @param { RawAttribute.attr } attributeValues
 * @returns {{ type: Type, constraints: Constraints }}
 */
function getAttributeConstraints(attributeValues: RawAttribute["attr"]): {
  type: Type;
  constraints: Constraints;
} {
  let type: Type = "boolean";
  if (numberTypes.includes(attributeValues.attributeType)) {
    type = "number";
  }
  if (stringTypes.includes(attributeValues.attributeType)) {
    type = "string";
  }
  if (attributeValues.attributeType === "Date") {
    type = "date";
  }
  const constraints: Constraints = {
    required: true,
  };
  if (attributeValues.optional === "YES") {
    constraints.required = false;
  }
  if (typeof attributeValues.minValueString === "number") {
    if (type === "number") {
      constraints.minValue = attributeValues.minValueString;
    } else {
      constraints.minLength = attributeValues.minValueString;
    }
  }
  if (typeof attributeValues.maxValueString === "number") {
    if (type === "number") {
      constraints.maxValue = attributeValues.maxValueString;
    } else {
      constraints.maxLength = attributeValues.maxValueString;
    }
  }
  if (attributeValues.regularExpressionString) {
    constraints.regex = attributeValues.regularExpressionString;
  }
  return {
    type,
    constraints,
  };
}

/**
 * Parse string XML data model to provide schema for Dexie database and validation schema for safelyAdd plugin
 *
 * @see safelyAdd
 * @see {@link http://testing.telahealth.com/api/v1/data-model}
 */
export default (
  xmlData: string,
): { model: DatabaseModel; validationSchema: ValidationSchema } => {
  const dbSchema = {
    version: 1,
    entities: {} as Record<string, DatabaseModelEntity>,
  };
  const validationSchema: ValidationSchema = {};

  const jsonObj = parser.parse(xmlData, options);
  const entities: RawEntity[] = jsonObj.model?.entity ?? [];
  for (const entity of entities) {
    const { name, syncable } = entity.attr;
    const dbEntitySchema = {
      name,
      syncable: syncable === "YES",
      attributes: {} as Record<string, DatabaseModelEntityAttribute>,
    };
    validationSchema[name] = {
      attributes: {},
      relationships: {},
    };
    for (const { attr } of entity.attribute) {
      const { name: attributeName, optional, attributeType } = attr;
      const attributeSchema = {
        name: attributeName,
        optional: optional === "YES",
        attributeType,
        indexed: false as const,
      };
      const { type, constraints } = getAttributeConstraints(attr);

      dbEntitySchema.attributes[attributeName] = attributeSchema;
      // @ts-expect-error
      validationSchema[name].attributes[attributeName] = { type, constraints };
    }

    if (entity.relationship) {
      for (const { attr } of Array.isArray(entity.relationship)
        ? entity.relationship
        : [entity.relationship]) {
        const {
          name: attributeName,
          optional,
          destinationEntity,
          toMany,
        } = attr;
        const attributeSchema = {
          name: attributeName,
          optional: optional === "YES",
          attributeType: "relationship",
          toMany: toMany === "YES",
        };
        const relationValidationSchema = {
          destinationEntity,
          toMany: toMany === "YES",
        };

        dbEntitySchema.attributes[attributeName] = attributeSchema;
        // @ts-expect-error
        validationSchema[name].relationships[attributeName] =
          relationValidationSchema;
      }
    }

    dbSchema.entities[dbEntitySchema.name] = dbEntitySchema;
  }

  return {
    model: dbSchema,
    validationSchema,
  };
};
