import { describe, expect, test } from "vitest";
import { IR } from "../src/ir.ts";
import generateZodFileFromIr from "../src/zod.ts";
import generateTypescriptDefinitionFileFromIr from "../src/ts.ts";

const testIr: IR = [
  {
    name: "ent1",
    docs: null,
    deprecated: null,
    attributes: [
      {
        name: "strAttr",
        type: "string",
        docs: null,
        deprecated: null,
        constraints: [{ kind: "required" }],
      },
      {
        name: "enumAttr",
        type: "enum",
        docs: "doc",
        deprecated: null,
        constraints: [
          { kind: "required" },
          { kind: "enum", value: ["One", "Two"] },
        ],
      },
    ],
    relations: [
      {
        name: "testRel2",
        docs: "hello2",
        deprecated: null,
        toMany: true,
        destinationEntity: "ent2",
      },
    ],
  },
  {
    name: "ent2",
    docs: "hello",
    deprecated: "use X instead",
    attributes: [
      {
        name: "numberAttr",
        type: "number",
        docs: null,
        deprecated: null,
        constraints: [{ kind: "minValue", value: 1 }],
      },
      {
        name: "dateAttr",
        type: "Date",
        docs: null,
        deprecated: null,
        constraints: [],
      },
    ],
    relations: [
      {
        name: "testRel1",
        docs: null,
        deprecated: null,
        toMany: false,
        destinationEntity: "ent1",
      },
    ],
  },
];

describe("type generators", () => {
  test("zod schema generator output is correct", () => {
    const expectedZodSchemaFile = `import { z } from "zod";

export const ent1Schema = z.object({
  strAttr: z.string(),
  /**
   * doc
   */
  enumAttr: z.enum(["One", "Two"]),
  /**
   * hello2
   */
  testRel2: z.string().uuid().array().optional(), // ent2
});

/**
 * hello
 * @deprecated use X instead
 */
export const ent2Schema = z.object({
  numberAttr: z.number().min(1).optional(),
  dateAttr: z.date().optional(),
  testRel1: z.string().uuid().array().length(1).optional(), // ent1
});

export type ent1 = z.infer<typeof ent1Schema>;
export type ent2 = z.infer<typeof ent2Schema>;\n\n`;

    expect(generateZodFileFromIr(testIr)).toEqual(expectedZodSchemaFile);
  });

  test("ts definitions generator output is correct", () => {
    const expectedZodSchemaFile = `export type ent1 = {
  strAttr: string,
  /**
   * doc
   */
  enumAttr: "One" | "Two",
  /**
   * hello2
   */
  testRel2?: Array<string>, // ent2
};

/**
 * hello
 * @deprecated use X instead
 */
export type ent2 = {
  /**
   * Minimum: 1
   */
  numberAttr?: number,
  dateAttr?: Date,
  testRel1?: Array<string>, // ent1
};\n\n`;

    expect(generateTypescriptDefinitionFileFromIr(testIr)).toEqual(
      expectedZodSchemaFile,
    );
  });
});