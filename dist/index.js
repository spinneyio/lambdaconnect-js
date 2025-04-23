#!/usr/bin/env node

// src/index.ts
import minimist from "minimist";

// src/generate/input.ts
import path from "path";
import { readFileSync } from "fs";
import { createInterface } from "readline";

// src/fetch/fetch.ts
import fs from "fs";
async function fetchModelString(url) {
  try {
    console.log("Fetching data model from the server...");
    const response = await fetch(url);
    const body = await response.json();
    if (!body.success) {
      console.log(`Server responded with code ${response.status}`);
      process.exit(1);
    }
    return body.model;
  } catch (err) {
    console.error("Could not fetch data model from the server");
    process.exit(1);
  }
}
async function fetchModel(config2) {
  const url = config2.fetch.url;
  if (!url) {
    console.error("Cannot fetch model. Url is missing.");
    process.exit(1);
  }
  const modelString = await fetchModelString(url);
  const outPath = config2.fetch.outPath;
  if (!outPath) {
    console.error(
      "Cannot save data model from the server. Output path is missing."
    );
    process.exit(1);
  }
  try {
    fs.writeFileSync(outPath, modelString);
    console.log(`Successfully written data model to ${outPath} \u2728`);
  } catch (err) {
    console.error(`Could not write data model at ${outPath}: ${err}`);
    process.exit(1);
  }
}

// src/generate/input.ts
async function input(config2) {
  if (config2.generate.inPath) {
    const relativePathToXmlFile = config2.generate.inPath;
    if (!relativePathToXmlFile) {
      console.log("No path provided");
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
  if (config2.generate.stdin) {
    const rl = createInterface({
      input: process.stdin
    });
    let xmlString = "";
    rl.on("line", (line) => {
      xmlString += line;
    });
    return new Promise((resolve) => {
      rl.on("close", () => {
        resolve(xmlString);
      });
    });
  }
  if (config2.generate.url) {
    return fetchModelString(config2.generate.url);
  }
  console.log("Invalid input options. See --help");
  process.exit(1);
}

// src/generate/ir.ts
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
function getStringEnum(obj) {
  if (!obj.userInfo?.entry) {
    return null;
  }
  if (Array.isArray(obj.userInfo.entry)) {
    const value = obj.userInfo.entry.find((e) => e?.key === "enum")?.value;
    return value ? parseStringEnum(value) : null;
  }
  if (obj.userInfo?.entry?.key === "enum") {
    const value = obj.userInfo.entry?.value;
    return value ? parseStringEnum(value) : null;
  }
  return null;
}
function javaRegexToJsRegex(regexString) {
  return regexString.replace("\\p{XDigit}", "[0-9A-Fa-f]");
}
function parseRegexEnum(regex) {
  const [_, withoutStart = ""] = regex.split("(");
  const [withoutEnd = ""] = withoutStart.split(")");
  return withoutEnd.split("|");
}
function parseStringEnum(s) {
  return s.split("|");
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
        if (type === "string") {
          const stringRegex = getStringEnum(attr);
          if (stringRegex) {
            return {
              type: "enum",
              name: attr.name,
              docs: docs2,
              deprecated: deprecationStatus2,
              constraints: [
                {
                  kind: "enum",
                  value: stringRegex
                },
                ...isOptional ? [] : [{ kind: "required" }]
              ]
            };
          }
        }
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

// src/generate/output.ts
import * as fs2 from "fs";
function output(config2, fileString) {
  const type = config2.generate.output;
  if (config2.generate.outPath) {
    fs2.writeFileSync(config2.generate.outPath, fileString);
    console.log(
      "Successfully written " + (type === "zod" ? "zod schema" : "Typescript type") + " definitions to " + config2.generate.outPath + " \u2728"
    );
    process.exit(0);
  }
  if (config2.generate.stdout) {
    process.stdout.write(fileString + "\n");
    process.exit(0);
  }
  console.log("Invalid output options. See --help");
}

// src/generate/document.ts
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

// src/generate/zod.ts
var typeToZodSchemaMethod = {
  boolean: "boolean",
  Date: "date",
  string: "string",
  enum: "enum",
  number: "number"
};
function generateZodFileFromIr(ir) {
  let fileString = `import { z } from "zod";

`;
  ir.forEach((entity) => {
    fileString += document(entity);
    fileString += `export const ${entity.name}Schema = z.object({
`;
    entity.attributes.forEach((attr) => {
      fileString += document(
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
      fileString += `  ${attr.name}: z.${m1}(${m1Arg || ""})${constraints}${isOptional ? ".optional()" : ""},
`;
    });
    entity.relations.forEach((rel) => {
      fileString += document(rel, 2);
      fileString += `  ${rel.name}: z.string().uuid()${rel.toMany ? ".array()" : ""}.optional(), // ${rel.destinationEntity}
`;
    });
    fileString += `});

`;
  });
  fileString += `export const SchemaMap = {
`;
  ir.forEach((entity) => {
    fileString += `  ${entity.name}: ${entity.name}Schema,
`;
  });
  fileString += `};

`;
  ir.forEach((entity) => {
    fileString += `export type ${entity.name} = z.infer<typeof ${entity.name}Schema>;
`;
  });
  fileString += `
`;
  fileString += `export type EntityMap = {
`;
  ir.forEach((entity) => {
    fileString += `  ${entity.name}: ${entity.name};
`;
  });
  fileString += `};
`;
  return fileString;
}

// src/generate/ts.ts
function generateTypescriptDefinitionFileFromIr(ir) {
  let fileString = ``;
  ir.forEach((entity) => {
    fileString += document(entity);
    fileString += `export type ${entity.name} = {
`;
    entity.attributes.forEach((attr) => {
      fileString += document(attr, 2);
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
      fileString += `  ${attr.name}${isOptional ? "?" : ""}: ${m1Arg || attr.type},
`;
    });
    entity.relations.forEach((rel) => {
      fileString += document(rel, 2);
      fileString += `  ${rel.name}?: ${rel.toMany ? "Array<string>" : "string"}, // ${rel.destinationEntity}
`;
    });
    fileString += `};

`;
  });
  fileString += `export type EntityMap = {
`;
  ir.forEach((entity) => {
    fileString += `  ${entity.name}: ${entity.name};
`;
  });
  fileString += `};
`;
  return fileString;
}

// src/config.ts
import path2 from "path";
import fs3 from "fs";
var defaultConfig = {
  generate: {
    output: "ts"
  },
  fetch: {}
};
function loadConfig() {
  const configPath = path2.join(process.cwd(), ".lambdaconnectrc");
  if (!fs3.existsSync(configPath)) {
    return defaultConfig;
  }
  try {
    const configContent = fs3.readFileSync(configPath, "utf8");
    const config2 = JSON.parse(configContent);
    return {
      ...defaultConfig,
      ...config2,
      generate: {
        ...defaultConfig.generate,
        ...config2?.generate ?? {}
      },
      fetch: {
        ...defaultConfig.fetch,
        ...config2?.fetch ?? {}
      }
    };
  } catch (err) {
    console.error(
      "Found .lambdaconnectrc but couldn't parse it. Using default config"
    );
    return defaultConfig;
  }
}
function getConfig(argv2) {
  const rcConfig = loadConfig();
  if (argv2._[0] === "generate") {
    return {
      ...rcConfig,
      generate: {
        output: argv2.zod || rcConfig.generate.output,
        url: argv2.url || rcConfig.generate.url || rcConfig.url,
        inPath: argv2["in-path"] || rcConfig.generate.inPath,
        outPath: argv2["out-path"] || rcConfig.generate.outPath || rcConfig.outPath,
        stdin: argv2.stdin || rcConfig.generate.stdin,
        stdout: argv2.stdout || rcConfig.generate.stdout
      }
    };
  }
  if (argv2._[0] === "fetch") {
    return {
      ...rcConfig,
      fetch: {
        url: argv2.url || rcConfig.fetch.url || rcConfig.url,
        outPath: argv2["out-path"] || rcConfig.fetch.outPath || rcConfig.outPath
      }
    };
  }
  return rcConfig;
}

// src/index.ts
var argv = minimist(process.argv.slice(2));
if (argv.help) {
  console.log(`
  Usage: lc-cli [command] [options]
      
  --help                Display this help message
  
  Commands:
    fetch               Fetch data model XML
    generate            Generate type definitions
    
  Fetch options:
    --url <url>         Fetch model from given endpoint
    --out-path <path>   Write generated file to given path
    
  e.g.
  lc-cli fetch --url http://api-url.com/api/v1/data-model --out-path ./resources/current.xml
    
  Generate options:
    Input options:
      --in-path <path>    Path to XML file
      --stdin             Read XML string from stdin
      --url <url>         Fetch model from given endpoint
      
    Format options:
      --ts (default)      Outputs a file with exported Typescript definitions
      --zod               Outputs a file with exported zod schemas
  
    Output options:
      --stdout            Pass the contents of generated file to stdout
      --out-path <path>   Write generated file to given path
    
  e.g.
  lc-cli generate --stdin --zod --out-path ./zodSchemas.ts
  lc-cli generate --in-path ./model.xml --std-out
  lc-cli generate --in-path ./model.xml --out-path ./types/index.ts
  lc-cli generate --http https://api-url.com/api/v1/data-model --out-path ./types.ts
  `);
  process.exit(0);
}
async function generate(config2) {
  const xmlString = await input(config2);
  const intermediateRepresentation = getIRFromXmlString(xmlString);
  let fileString = "// This file was generated. Do not edit manually.\n\n";
  if (config2.generate.output === "zod") {
    fileString += generateZodFileFromIr(intermediateRepresentation);
  } else {
    fileString += generateTypescriptDefinitionFileFromIr(
      intermediateRepresentation
    );
  }
  output(config2, fileString);
}
var command = argv._[0];
var config = getConfig(argv);
if (command === "generate") {
  await generate(config);
} else if (command === "fetch") {
  await fetchModel(config);
} else {
  console.error("Unknown command: ", command);
  console.error("See lc-cli --help for available commands.");
}
