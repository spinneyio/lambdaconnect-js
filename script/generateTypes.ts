import { Type, ValidationSchema } from "../src/utils/types";

function getTypeScriptType(type: Type): string {
  if (type === "boolean") {
    return "NumericBoolean";
  }
  if (type === "date") {
    return "string";
  }

  return type;
}

const requiredAttributes = ["uuid", "createdAt", "updatedAt", "active"];

export function generateTypes(schema: ValidationSchema) {
  let bigString = "";
  bigString += "// This file is generated. Do not edit it manually.\n\n";
  bigString += "export type UUID = string;\n\n";
  bigString += "export type NumericBoolean = 0 | 1;\n\n";

  for (const [name, { attributes, relationships }] of Object.entries(schema)) {
    bigString += `export type ${name} = {\n`;

    for (const [attributeName, attributeType] of Object.entries(attributes)) {
      if (requiredAttributes.includes(attributeName)) {
        bigString += `  ${attributeName}: ${getTypeScriptType(
          attributeType.type,
        )};\n`;
        continue;
      }

      const isRequired = !!attributeType.constraints?.required;
      const isEnum =
        attributeType.type === "string" &&
        !!attributeType.constraints?.regex &&
        (attributeType.constraints.regex.startsWith("(") ||
          attributeType.constraints.regex.startsWith("^(")) &&
        (attributeType.constraints.regex.endsWith(")") ||
          attributeType.constraints.regex.endsWith(")$")) &&
        attributeType.constraints.regex.includes("|");

      if (isEnum) {
        // @ts-ignore
        const enumValues = attributeType.constraints.regex
          .replace("^(", "")
          .replace(")$", "")
          .replace("(", "")
          .replace(")", "")
          .split("|")
          .map((value) => `'${value}'`)
          .join(" | ");

        bigString += `  ${attributeName}${
          isRequired ? ":" : "?:"
        } ${enumValues}${isRequired ? "" : " | null"};\n`;
        continue;
      }

      bigString += `  ${attributeName}${
        isRequired ? ":" : "?:"
      } ${getTypeScriptType(attributeType.type)}${
        isRequired ? "" : " | null"
      };\n`;
    }

    if (relationships) {
      for (const [relationshipName, relationshipType] of Object.entries(
        relationships,
      )) {
        const isToMany = !!relationshipType.toMany;

        bigString += `  // ${relationshipType.destinationEntity} ${
          isToMany ? "uuids" : "uuid"
        }\n`;
        bigString += `  ${relationshipName}?: ${
          isToMany ? "Array<UUID>" : "UUID"
        } | null;\n`;
      }
    }

    bigString += "};\n\n";
  }

  return bigString;
}
