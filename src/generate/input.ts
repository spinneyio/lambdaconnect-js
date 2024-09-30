import path from "node:path";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { Config } from "../config.ts";
import { fetchModelString } from "../fetch/fetch.ts";

export default async function input(config: Config): Promise<string> {
  // --in-path <path>
  if (config.generate.inPath) {
    const relativePathToXmlFile = config.generate.inPath;

    if (!relativePathToXmlFile) {
      console.log("No path provided");
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
  if (config.generate.stdin) {
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

  // --url
  if (config.generate.url) {
    return fetchModelString(config.generate.url);
  }

  console.log("Invalid input options. See --help");
  process.exit(1);
}
