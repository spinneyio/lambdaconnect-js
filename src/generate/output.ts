import * as fs from "node:fs";
import { Config } from "../config.ts";

export default function output(config: Config, fileString: string) {
  const type = config.generate.output;

  if (config.generate.outPath) {
    fs.writeFileSync(config.generate.outPath, fileString);

    console.log(
      "Successfully written " +
        (type === "zod" ? "zod schema" : "Typescript type") +
        " definitions to " +
        config.generate.outPath +
        " ✨",
    );
    process.exit(0);
  }

  if (config.generate.stdout) {
    process.stdout.write(fileString + "\n");
    process.exit(0);
  }

  console.log("Invalid output options. See --help");
}
