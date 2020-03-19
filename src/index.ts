#!/usr/bin/env node

import minimist from "minimist";
import input from "./input.ts";
import getIRFromXmlString from "./ir.ts";
import output from "./output.ts";
import generateZodFileFromIr from "./zod.ts";
import generateTypescriptDefinitionFileFromIr from "./ts.ts";

const argv = minimist(process.argv.slice(2));

// todo --http
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

const xmlString = await input(argv);
const intermediateRepresentation = getIRFromXmlString(xmlString);

let fileString = "// This file was generated. Do not edit manually.\n\n";

if (argv.zod) {
  fileString += generateZodFileFromIr(intermediateRepresentation);
} else {
  fileString += generateTypescriptDefinitionFileFromIr(
    intermediateRepresentation,
  );
}

output(argv, fileString);
