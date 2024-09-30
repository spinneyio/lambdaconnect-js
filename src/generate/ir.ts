import { XMLParser } from "fast-xml-parser";

const modelTypeToTsType = {
  Boolean: "boolean",
  String: "string",
  Date: "Date",
  UUID: "string",
  URI: "string",
  "Integer 64": "number",
  "Integer 32": "number",
  "Integer 16": "number",
  Float: "number",
  Double: "number",
} as const;

const additionalTypeConstraints = {
  Boolean: null,
  String: null,
  Date: null,
  UUID: { kind: "uuid" },
  URI: { kind: "url" },
  "Integer 64": { kind: "int" },
  "Integer 32": { kind: "int" },
  "Integer 16": { kind: "int" },
  Float: null,
  Double: null,
} as const;

function isRegexEnumRegex(regex: string): boolean {
  return (
    (regex.startsWith("(") || regex.startsWith("^(")) &&
    (regex.endsWith(")") || regex.endsWith(")$")) &&
    regex.includes("|")
  );
}

function javaRegexToJsRegex(regexString: string) {
  return regexString.replace("\\p{XDigit}", "[0-9A-Fa-f]");
}

function parseRegexEnum(regex: string): Array<string> {
  const [_, withoutStart = ""] = regex.split("(");
  const [withoutEnd = ""] = withoutStart.split(")");
  return withoutEnd.split("|");
}

function getDocumentation(obj: any): string | null {
  if (!obj.userInfo?.entry) {
    return null;
  }

  if (Array.isArray(obj.userInfo.entry)) {
    return (
      obj.userInfo.entry.find((e: any) => e?.key === "docs")?.value || null
    );
  }

  if (obj.userInfo?.entry?.key === "docs") {
    return obj.userInfo.entry.value;
  }

  return null;
}

function getDeprecationStatus(obj: any): string | null {
  if (!obj.userInfo?.entry) {
    return null;
  }

  if (Array.isArray(obj.userInfo.entry)) {
    return (
      obj.userInfo.entry.find((e: any) => e?.key === "deprecated")?.value ||
      null
    );
  }

  if (obj.userInfo?.entry?.key === "deprecated") {
    return obj.userInfo.entry.value;
  }

  return null;
}

type BaseEntity = {
  name: string;
  docs: string | null;
  deprecated: string | null;
};

export type Constraint =
  | {
      kind: "maxLength" | "minLength" | "minValue" | "maxValue";
      value: number;
    }
  | {
      kind: "regex";
      value: string;
    }
  | {
      kind: "enum";
      value: Array<string>;
    }
  | {
      kind: "int" | "uuid" | "url" | "required";
    };

export type Attribute = BaseEntity & {
  type: (typeof modelTypeToTsType)[keyof typeof modelTypeToTsType] | "enum";
  constraints: Array<Constraint>;
};

type Relation = BaseEntity & {
  toMany: boolean;
  destinationEntity: string;
};

type Entity = BaseEntity & {
  attributes: Array<Attribute>;
  relations: Array<Relation>;
};

export type IR = Array<Entity>;

export default function getIRFromXmlString(xml: string): IR {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
  });
  const jsonObj = parser.parse(xml);

  if (!jsonObj.model?.entity) {
    console.log("XML is not a valid Lambdaconnect model");
    process.exit(1);
  }

  const entities = Array.isArray(jsonObj.model.entity)
    ? [...jsonObj.model.entity]
    : [jsonObj.model.entity];

  if (!Array.isArray(entities)) {
    console.log("No entities found.");
    process.exit(1);
  }

  const syncableEntities = entities.filter(
    (e: any) => !!e?.syncable && e.syncable === "YES",
  );

  const ir: IR = [];

  for (const entity of syncableEntities) {
    const name = entity.name;
    const rawAttributes = Array.isArray(entity.attribute ?? [])
      ? (entity.attribute ?? [])
      : [entity.attribute];
    const rawRelations = Array.isArray(entity.relationship ?? [])
      ? (entity.relationship ?? [])
      : [entity.relationship];

    const attributes: Array<Attribute> = rawAttributes.map(
      (attr: any): Attribute => {
        const isOptional = attr.optional === "YES";
        const isEnum =
          attr.regularExpressionString &&
          isRegexEnumRegex(attr.regularExpressionString);

        const docs = getDocumentation(attr);
        const deprecationStatus = getDeprecationStatus(attr);

        if (isEnum) {
          return {
            type: "enum",
            name: attr.name,
            docs: docs,
            deprecated: deprecationStatus,
            constraints: [
              {
                kind: "enum",
                value: parseRegexEnum(attr.regularExpressionString),
              },
              ...(isOptional ? [] : [{ kind: "required" } as const]),
            ],
          } satisfies Attribute;
        }

        // ugly cast
        const modelType = attr.attributeType as keyof typeof modelTypeToTsType;
        const type = modelTypeToTsType[modelType];

        const constraints: Array<Constraint> = [];

        const additionalConstraints = additionalTypeConstraints[modelType];
        if (additionalConstraints) {
          constraints.push(additionalConstraints);
        }

        if (attr.minValueString) {
          constraints.push({
            kind: type === "string" ? "minLength" : "minValue",
            value: Number(attr.minValueString),
          });
        }

        if (attr.maxValueString) {
          // constraints += `.max(${attr.maxValueString})`;
          constraints.push({
            kind: type === "string" ? "maxLength" : "maxValue",
            value: Number(attr.maxValueString),
          });
        }

        if (attr.regularExpressionString) {
          constraints.push({
            kind: "regex",
            value: `/${javaRegexToJsRegex(attr.regularExpressionString)}/`,
          });
        }

        if (!isOptional) {
          constraints.push({
            kind: "required",
          });
        }

        return {
          name: attr.name,
          type,
          docs: docs,
          deprecated: deprecationStatus,
          constraints: constraints,
        } satisfies Attribute;
      },
    );

    const relations: Array<Relation> = rawRelations.map(
      (rel: any): Relation => {
        const docs = getDocumentation(rel);
        const deprecationStatus = getDeprecationStatus(rel);

        return {
          name: rel.name,
          docs,
          deprecated: deprecationStatus,
          toMany: rel.toMany === "YES",
          destinationEntity: rel.destinationEntity,
        } satisfies Relation;
      },
    );

    const docs = getDocumentation(entity);
    const deprecationStatus = getDeprecationStatus(entity);

    ir.push({
      name: name,
      attributes: attributes,
      relations: relations,
      deprecated: deprecationStatus,
      docs: docs,
    });
  }

  return ir;
}
