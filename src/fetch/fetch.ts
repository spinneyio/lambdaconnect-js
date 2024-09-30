import { Config } from "../config.ts";
import fs from "node:fs";

export async function fetchModelString(url: string) {
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

export default async function fetchModel(config: Config) {
  const url = config.fetch.url;

  if (!url) {
    console.error("Cannot fetch model. Url is missing.");
    process.exit(1);
  }

  const modelString = await fetchModelString(url);

  const outPath = config.fetch.outPath;

  if (!outPath) {
    console.error(
      "Cannot save data model from the server. Output path is missing.",
    );
    process.exit(1);
  }

  try {
    fs.writeFileSync(outPath, modelString);
    console.log(`Successfully written data model to ${outPath} ✨`);
  } catch (err) {
    console.error(`Could not write data model at ${outPath}: ${err}`);
    process.exit(1);
  }
}
