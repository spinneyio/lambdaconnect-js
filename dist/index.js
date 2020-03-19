#!/usr/bin/env node

// src/index.ts
import minimist from "minimist";

// src/input.ts
import path from "path";
import { readFileSync } from "fs";
import { createInterface } from "readline";
async function input(argv2) {
  if (argv2["in-path"]) {
    const relativePathToXmlFile = argv2["in-path"];
    if (!relativePathToXmlFile) {
      console.log("No path provided");
      process.exit(1);
    }
    if (typeof relativePathToXmlFile !== "string") {
      console.log("Path must be a string");
      process.exit(1);
    }
    const xmlFilePath = path.resolve(relativePathToXmlFile);
    let xml;
    try {
      xml = readFileSync(xmlFilePath, "utf8");
      return xml;
    } catch (error) {
      console.log(`Error reading file at ${xmlFilePath}`);
      process.exit(1);
    }
  }
  if (argv2.stdin) {
    const rl = createInterface({
      input: process.stdin
    });
    let xmlString2 = "";
    rl.on("line", (line) => {
      xmlString2 += line;
    });
    return new Promise((resolve) => {
      rl.on("close", () => {
        resolve(xmlString2);
      });
    });
  }
  console.log("Invalid input options. See --help");
  process.exit(1);
}

// src/ir.ts
import { XMLParser } from "fast-xml-parser";
var modelTypeToTsType = {
  Boolean: "boolean",
  String: "string",
  Date: "Date",
  UUID: "string",
  URI: "string",
  "Integer 64": "number",
  "Integer 32": "number",
  "Integer 16": "number",
  Float: "number",
  Double: "number"
};
var additionalTypeConstraints = {
  Boolean: null,
  String: null,
  Date: null,
  UUID: { kind: "uuid" },
  URI: { kind: "url" },
  "Integer 64": { kind: "int" },
  "Integer 32": { kind: "int" },
  "Integer 16": { kind: "int" },
  Float: null,
  Double: null
};
function isRegexEnumRegex(regex) {
  return (regex.startsWith("(") || regex.startsWith("^(")) && (regex.endsWith(")") || regex.endsWith(")$")) && regex.includes("|");
}
function javaRegexToJsRegex(regexString) {
  return regexString.replace("\\p{XDigit}", "[0-9A-Fa-f]");
}
function parseRegexEnum(regex) {
  const [_, withoutStart = ""] = regex.split("(");
  const [withoutEnd = ""] = withoutStart.split(")");
  return withoutEnd.split("|");
}
function getDocumentation(obj) {
  if (!obj.userInfo?.entry) {
    return null;
  }
  if (Array.isArray(obj.userInfo.entry)) {
    return obj.userInfo.entry.find((e) => e?.key === "docs")?.value || null;
  }
  if (obj.userInfo?.entry?.key === "docs") {
    return obj.userInfo.entry.value;
  }
  return null;
}
function getDeprecationStatus(obj) {
  if (!obj.userInfo?.entry) {
    return null;
  }
  if (Array.isArray(obj.userInfo.entry)) {
    return obj.userInfo.entry.find((e) => e?.key === "deprecated")?.value || null;
  }
  if (obj.userInfo?.entry?.key === "deprecated") {
    return obj.userInfo.entry.value;
  }
  return null;
}
function getIRFromXmlString(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ""
  });
  const jsonObj = parser.parse(xml);
  if (!jsonObj.model?.entity) {
    console.log("XML is not a valid Lambdaconnect model");
    process.exit(1);
  }
  const entities = Array.isArray(jsonObj.model.entity) ? [...jsonObj.model.entity] : [jsonObj.model.entity];
  if (!Array.isArray(entities)) {
    console.log("No entities found.");
    process.exit(1);
  }
  const syncableEntities = entities.filter(
    (e) => !!e?.syncable && e.syncable === "YES"
  );
  const ir = [];
  for (const entity of syncableEntities) {
    const name = entity.name;
    const rawAttributes = Array.isArray(entity.attribute ?? []) ? entity.attribute ?? [] : [entity.attribute];
    const rawRelations = Array.isArray(entity.relationship ?? []) ? entity.relationship ?? [] : [entity.relationship];
    const attributes = rawAttributes.map(
      (attr) => {
        const isOptional = attr.optional === "YES";
        const isEnum = attr.regularExpressionString && isRegexEnumRegex(attr.regularExpressionString);
        const docs2 = getDocumentation(attr);
        const deprecationStatus2 = getDeprecationStatus(attr);
        if (isEnum) {
          return {
            type: "enum",
            name: attr.name,
            docs: docs2,
            deprecated: deprecationStatus2,
            constraints: [
              {
                kind: "enum",
                value: parseRegexEnum(attr.regularExpressionString)
              },
              ...isOptional ? [] : [{ kind: "required" }]
            ]
          };
        }
        const modelType = attr.attributeType;
        const type = modelTypeToTsType[modelType];
        const constraints = [];
        const additionalConstraints = additionalTypeConstraints[modelType];
        if (additionalConstraints) {
          constraints.push(additionalConstraints);
        }
        if (attr.minValueString) {
          constraints.push({
            kind: type === "string" ? "minLength" : "minValue",
            value: Number(attr.minValueString)
          });
        }
        if (attr.maxValueString) {
          constraints.push({
            kind: type === "string" ? "maxLength" : "maxValue",
            value: Number(attr.maxValueString)
          });
        }
        if (attr.regularExpressionString) {
          constraints.push({
            kind: "regex",
            value: `/${javaRegexToJsRegex(attr.regularExpressionString)}/`
          });
        }
        if (!isOptional) {
          constraints.push({
            kind: "required"
          });
        }
        return {
          name: attr.name,
          type,
          docs: docs2,
          deprecated: deprecationStatus2,
          constraints
        };
      }
    );
    const relations = rawRelations.map(
      (rel) => {
        const docs2 = getDocumentation(rel);
        const deprecationStatus2 = getDeprecationStatus(rel);
        return {
          name: rel.name,
          docs: docs2,
          deprecated: deprecationStatus2,
          toMany: rel.toMany === "YES",
          destinationEntity: rel.destinationEntity
        };
      }
    );
    const docs = getDocumentation(entity);
    const deprecationStatus = getDeprecationStatus(entity);
    ir.push({
      name,
      attributes,
      relations,
      deprecated: deprecationStatus,
      docs
    });
  }
  return ir;
}

// src/output.ts
import * as fs from "fs";
function output(argv2, fileString2) {
  const type = argv2.zod ? "zod" : "ts";
  if (argv2["out-path"]) {
    fs.writeFileSync(argv2["out-path"], fileString2);
    console.log(
      "Successfully written " + (type === "zod" ? "zod schema" : "Typescript type") + " definitions to " + argv2["out-path"] + " \u2728"
    );
    process.exit(0);
  }
  if (argv2.stdout) {
    process.stdout.write(fileString2 + "\n");
    process.exit(0);
  }
  console.log("Invalid output options. See --help");
}

// src/document.ts
function document(obj, indent = 0) {
  function format(message) {
    return `${" ".repeat(indent)} * ${message}
`;
  }
  let docString = "";
  const { constraints, docs, deprecated } = obj;
  const shouldDocument = docs || deprecated || constraints && constraints.filter((c) => c.kind !== "required" && c.kind !== "enum").length !== 0;
  if (shouldDocument) {
    docString += `${" ".repeat(indent)}/**
`;
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
            `At least ${constraint.value} character${constraint.value === 1 ? "" : "s"} long`
          );
          break;
        case "maxLength":
          docString += format(
            `At most ${constraint.value} character${constraint.value === 1 ? "" : "s"} long`
          );
          break;
        case "regex":
          docString += format(
            `Must comply with ${constraint.value.substring(1, constraint.value.length - 1)} regular expression`
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
    docString += `${" ".repeat(indent)} */
`;
  }
  return docString;
}

// src/zod.ts
var typeToZodSchemaMethod = {
  boolean: "boolean",
  Date: "date",
  string: "string",
  enum: "enum",
  number: "number"
};
function generateZodFileFromIr(ir) {
  let fileString2 = `import { z } from "zod";

`;
  ir.forEach((entity) => {
    fileString2 += document(entity);
    fileString2 += `export const ${entity.name}Schema = z.object({
`;
    entity.attributes.forEach((attr) => {
      fileString2 += document(
        { docs: attr.docs, deprecated: attr.deprecated },
        2
      );
      let constraints = "";
      let isOptional = true;
      let m1Arg = "";
      attr.constraints.forEach((c) => {
        if (c.kind === "required") {
          isOptional = false;
          return;
        }
        if (c.kind === "enum") {
          c.value;
          m1Arg = `[${c.value.map((enumMember) => `"${enumMember}"`).join(", ")}]`;
          return;
        }
        if (c.kind === "int") {
          constraints += ".int()";
        }
        if (c.kind === "url") {
          constraints += ".url()";
        }
        if (c.kind === "uuid") {
          constraints += ".uuid()";
        }
        if (c.kind === "minValue" || c.kind === "minLength") {
          constraints += `.min(${c.value})`;
          return;
        }
        if (c.kind === "maxValue" || c.kind === "maxLength") {
          constraints += `.max(${c.value})`;
          return;
        }
        if (c.kind === "regex") {
          constraints += `.regex(${c.value})`;
        }
      });
      const m1 = typeToZodSchemaMethod[attr.type];
      fileString2 += `  ${attr.name}: z.${m1}(${m1Arg || ""})${constraints}${isOptional ? ".optional()" : ""},
`;
    });
    entity.relations.forEach((rel) => {
      fileString2 += document(rel, 2);
      fileString2 += `  ${rel.name}: z.string().uuid().array()${rel.toMany ? "" : ".length(1)"}.optional(), // ${rel.destinationEntity}
`;
    });
    fileString2 += `});

`;
  });
  return fileString2;
}

// src/ts.ts
function generateTypescriptDefinitionFileFromIr(ir) {
  let fileString2 = ``;
  ir.forEach((entity) => {
    fileString2 += document(entity);
    fileString2 += `export type ${entity.name} = {
`;
    entity.attributes.forEach((attr) => {
      fileString2 += document(attr, 2);
      let isOptional = true;
      let m1Arg = "";
      attr.constraints.forEach((c) => {
        if (c.kind === "required") {
          isOptional = false;
          return;
        }
        if (c.kind === "enum") {
          c.value;
          m1Arg = `${c.value.map((enumMember) => `"${enumMember}"`).join(" | ")}`;
          return;
        }
      });
      fileString2 += `  ${attr.name}${isOptional ? "?" : ""}: ${m1Arg || attr.type},
`;
    });
    entity.relations.forEach((rel) => {
      fileString2 += document(rel, 2);
      fileString2 += `  ${rel.name}?: Array<string>, // ${rel.destinationEntity}
`;
    });
    fileString2 += `};

`;
  });
  return fileString2;
}

// src/index.ts
var argv = minimist(process.argv.slice(2));
if (argv.help) {
  console.log(`
  Usage: lc-ts-generator [options]
      
  --help                Display this help message
  
  Input options:
    --in-path <path>    Path to XML file
    --stdin             Read XML string from stdin
    
  Format options:
    --ts (default)      Outputs file with exported Typescript definitions
    --zod               Outputs file with exported zod schemas

  Output options:
    --stdout            Pass the contents of generated file to stdout
    --out-path <path>   Write generated file to provided path
    
  e.g.
  model-parser --stdin --zod --out-path ./zodSchemas.ts
  model-parser --in-path ./model.xml --std-out
  model-parser --in-path ./model.xml --out-path ./types/index.ts
  `);
  process.exit(0);
}
var xmlString = await input(argv);
var intermediateRepresentation = getIRFromXmlString(xmlString);
var fileString = "// This file was generated. Do not edit manually.\n\n";
if (argv.zod) {
  fileString += generateZodFileFromIr(intermediateRepresentation);
} else {
  fileString += generateTypescriptDefinitionFileFromIr(
    intermediateRepresentation
  );
}
output(argv, fileString);
