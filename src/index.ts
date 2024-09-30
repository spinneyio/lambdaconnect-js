#!/usr/bin/env node

import minimist from "minimist";
import input from "./generate/input.ts";
import getIRFromXmlString from "./generate/ir.ts";
import output from "./generate/output.ts";
import generateZodFileFromIr from "./generate/zod.ts";
import generateTypescriptDefinitionFileFromIr from "./generate/ts.ts";
import { Config, getConfig } from "./config.ts";
import fetchModel from "./fetch/fetch.ts";

const argv = minimist(process.argv.slice(2));

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

async function generate(config: Config) {
  const xmlString = await input(config);
  const intermediateRepresentation = getIRFromXmlString(xmlString);

  let fileString = "// This file was generated. Do not edit manually.\n\n";

  if (config.generate.output === "zod") {
    fileString += generateZodFileFromIr(intermediateRepresentation);
  } else {
    fileString += generateTypescriptDefinitionFileFromIr(
      intermediateRepresentation,
    );
  }

  output(config, fileString);
}

const command = argv._[0];
const config = getConfig(argv);

if (command === "generate") {
  await generate(config);
} else if (command === "fetch") {
  await fetchModel(config);
} else {
  console.error("Unknown command: ", command);
  console.error("See lc-cli --help for available commands.");
}
