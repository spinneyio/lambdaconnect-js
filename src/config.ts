import path from "node:path";
import fs from "node:fs";
import minimist from "minimist";

export type Config = {
  url?: string;
  outPath?: string;
  generate: {
    output: "zod" | "ts";
    url?: string;
    inPath?: string;
    outPath?: string;
    stdin?: boolean;
    stdout?: boolean;
  };
  fetch: {
    url?: string;
    outPath?: string;
  };
};

const defaultConfig: Config = {
  generate: {
    output: "ts",
  },
  fetch: {},
};

function loadConfig(): Config {
  const configPath = path.join(process.cwd(), ".lambdaconnectrc");

  if (!fs.existsSync(configPath)) {
    return defaultConfig;
  }

  try {
    const configContent = fs.readFileSync(configPath, "utf8");
    const config = JSON.parse(configContent);
    return {
      ...defaultConfig,
      ...config,
      generate: {
        ...defaultConfig.generate,
        ...(config?.generate ?? {}),
      },
      fetch: {
        ...defaultConfig.fetch,
        ...(config?.fetch ?? {}),
      },
    };
  } catch (err) {
    console.error(
      "Found .lambdaconnectrc but couldn't parse it. Using default config",
    );
    return defaultConfig;
  }
}

export function getConfig(argv: minimist.ParsedArgs): Config {
  const rcConfig = loadConfig();

  if (argv._[0] === "generate") {
    return {
      ...rcConfig,
      generate: {
        output: argv.zod || rcConfig.generate.output,
        url: argv.url || rcConfig.generate.url || rcConfig.url,
        inPath: argv["in-path"] || rcConfig.generate.inPath,
        outPath:
          argv["out-path"] || rcConfig.generate.outPath || rcConfig.outPath,
        stdin: argv.stdin || rcConfig.generate.stdin,
        stdout: argv.stdout || rcConfig.generate.stdout,
      },
    } satisfies Config;
  }

  if (argv._[0] === "fetch") {
    return {
      ...rcConfig,
      fetch: {
        url: argv.url || rcConfig.fetch.url || rcConfig.url,
        outPath: argv["out-path"] || rcConfig.fetch.outPath || rcConfig.outPath,
      },
    } satisfies Config;
  }

  return rcConfig;
}
