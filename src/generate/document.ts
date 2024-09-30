import { Constraint } from "./ir.ts";

export default function document(
  obj: {
    docs: string | null;
    deprecated: string | null;
    constraints?: Array<Constraint>;
  },
  indent = 0,
) {
  function format(message: string): string {
    return `${" ".repeat(indent)} * ${message}\n`;
  }

  let docString = "";
  const { constraints, docs, deprecated } = obj;

  const shouldDocument =
    docs ||
    deprecated ||
    (constraints &&
      constraints.filter((c) => c.kind !== "required" && c.kind !== "enum")
        .length !== 0);

  if (shouldDocument) {
    docString += `${" ".repeat(indent)}/**\n`;
  }

  if (docs) {
    docString += format(docs);
  }

  if (constraints && constraints.length !== 0) {
    constraints.forEach((constraint) => {
      switch (constraint.kind) {
        case "int":
          docString += format("Must be an integer");
          break;
        case "url":
          docString += format("Must be a valid URL");
          break;
        case "minLength":
          docString += format(
            `At least ${constraint.value} character${constraint.value === 1 ? "" : "s"} long`,
          );
          break;
        case "maxLength":
          docString += format(
            `At most ${constraint.value} character${constraint.value === 1 ? "" : "s"} long`,
          );
          break;
        case "regex":
          docString += format(
            `Must comply with ${constraint.value.substring(1, constraint.value.length - 1)} regular expression`,
          );
          break;
        case "uuid":
          docString += format(`Must be a UUID`);
          break;
        case "minValue":
          docString += format(`Minimum: ${constraint.value}`);
          break;
        case "maxValue":
          docString += format(`Maximum: ${constraint.value}`);
          break;
      }
    });
  }

  if (deprecated) {
    docString += format(`@deprecated ${deprecated}`);
  }

  if (shouldDocument) {
    docString += `${" ".repeat(indent)} */\n`;
  }

  return docString;
}
