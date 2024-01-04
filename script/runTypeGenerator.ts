import fs from "fs";
import { fetchModel } from "./fetchModel.js";
import modelParser from "../src/utils/modelParser.js";
import { generateTypes } from "./generateTypes.js";

const path = process.argv[2];

if (!path) {
  console.error("Provide output path");
  process.exit(1);
}

console.log("Downloading data model...");
fetchModel((model) => {
  console.log("Parsing data model...");
  const { validationSchema } = modelParser(model);
  console.log("Generating types...");
  const typesFileContent = generateTypes(validationSchema);
  console.log("Writing types to provided path...");
  fs.writeFileSync(path, typesFileContent);
  console.log("Done! 🎉");
});
