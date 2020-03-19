import minimist from "minimist";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

export default async function input(
  argv: minimist.ParsedArgs,
): Promise<string> {
  // --in-path <path>
  if (argv["in-path"]) {
    const relativePathToXmlFile = argv["in-path"];

    if (!relativePathToXmlFile) {
      console.log("No path provided");
      process.exit(1);
    }

    if (typeof relativePathToXmlFile !== "string") {
      console.log("Path must be a string");
      process.exit(1);
    }

    const xmlFilePath = path.resolve(relativePathToXmlFile);
    let xml: string;
    try {
      xml = readFileSync(xmlFilePath, "utf8");
      return xml;
    } catch (error) {
      console.log(`Error reading file at ${xmlFilePath}`);
      process.exit(1);
    }
  }

  // --stdin
  if (argv.stdin) {
    const rl = createInterface({
      input: process.stdin,
    });

    let xmlString = "";
    rl.on("line", (line) => {
      xmlString += line;
    });

    return new Promise<string>((resolve) => {
      rl.on("close", () => {
        resolve(xmlString);
      });
    });
  }

  console.log("Invalid input options. See --help");
  process.exit(1);
}
