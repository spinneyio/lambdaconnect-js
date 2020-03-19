import minimist from "minimist";
import * as fs from "node:fs";

export default function output(argv: minimist.ParsedArgs, fileString: string) {
  const type = argv.zod ? "zod" : "ts";

  if (argv["out-path"]) {
    fs.writeFileSync(argv["out-path"], fileString);

    console.log(
      "Successfully written " +
        (type === "zod" ? "zod schema" : "Typescript type") +
        " definitions to " +
        argv["out-path"] +
        " ✨",
    );
    process.exit(0);
  }

  if (argv.stdout) {
    process.stdout.write(fileString + "\n");
    process.exit(0);
  }

  console.log("Invalid output options. See --help");
}
