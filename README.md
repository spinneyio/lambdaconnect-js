# lambdaconnect-ts-generator

CoreData model parser and Typescript generator. Allows for generating Typescript type definitions or [zod](https://github.com/colinhacks/zod) schemas based on CoreData model.

## Installation

Requires node >= 18

Run

`npm install spinneyio/lambdaconnect-js --save-dev`

inside your project directory to add `lc-ts-generator` to your project's devDependencies.

Or run

`npm install spinneyio/lambdaconnect-js -g`

to install `lc-ts-generator` globally.

## Usage

Run `npx lc-ts-generator --help` to see all available flags and options.

```
Input options:
--in-path <path>    Path to XML file
--stdin             Read XML string from stdin

Format options:
--ts (default)      Outputs file with exported Typescript definitions
--zod               Outputs file with exported zod schemas

Output options:
--stdout            Pass the contents of generated file to stdout
--out-path <path>   Write generated file to provided path
```

### Example

```
cat model.xml | npx lc-ts-generator --stdin --zod --out-path ./zodSchemas.ts
npx lc-ts-generator --in-path ./model.xml --out-path ./types/index.ts
npx lc-ts-generator --in-path ./model.xml --std-out
```

Running `lc-ts-generator` on

`model.xml`
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<model>
  <entity name="User" syncale="YES">
    <attribute name="id" attributeType="UUID" />
    <attribute name="email" attributeType="String" regularExpressionString="\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b" />
    <attribute name="name" attributeType="String" minValueString="1" maxValueString="100" optional="YES">
      <userInfo>
        <entry key="docs" value="User's full legal name" />
      </userInfo>
    </attribute>
    <relationship name="clients" optional="YES" toMany="YES" deletionRule="Nullify" destinationEntity="Client" inverseName="user"/>
  </entity>
</model>
```

will generate

`schemas.ts`

```ts
import { z } from "zod";

export const UserSchema = {
  id: z.string().uuid(),
  email: z.string().regex(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/),
  /**
   * User's full legal name
   */
  name: z.string().min(1).max(100).optional(),
  clients: z.string().uuid().array().optional() // Client,
};

export type User = z.infer<typeof UserSchema>;
```

or `types.ts`

```ts
export type User = {
  id: string,
  /**
   * Must comply with regex \b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b
   */
  email: string,
  /**
   * User's full legal name
   * Minumum: 1
   * Maximium: 100
   */
  name?: string,
  clients: Array<string>, // Client
};
```

## License
MIT License

Copyright © 2024 Spinney
