import { it, expect, describe, test } from "vitest";
import document from "../src/generate/document.ts";
import { Constraint } from "../src/generate/ir.ts";

describe("generating entity documentation", () => {
  it("no documentation generates empty string", () => {
    const emptyDocs = { docs: null, deprecated: null };

    expect(document(emptyDocs)).toEqual("");
    expect(document({ ...emptyDocs, docs: "" })).toEqual("");
    expect(document({ ...emptyDocs, constraints: [] })).toEqual("");
    expect(document(emptyDocs, 2)).toEqual("");
  });

  test("only arbitrary docs string", () => {
    const docs = {
      docs: "This is important!",
      deprecated: null,
    };

    expect(document(docs)).toEqual("/**\n * This is important!\n */\n");
    expect(document(docs, 3)).toEqual(
      "   /**\n    * This is important!\n    */\n",
    );
  });

  test("only deprecation notice", () => {
    const docs = { docs: null, deprecated: "Use X instead!" };

    expect(document(docs)).toEqual("/**\n * @deprecated Use X instead!\n */\n");
    expect(document({ ...docs, docs: "" })).toEqual(
      "/**\n * @deprecated Use X instead!\n */\n",
    );
    expect(document(docs, 2)).toEqual(
      "  /**\n   * @deprecated Use X instead!\n   */\n",
    );
  });

  test("only constraints", () => {
    const getEmptyDocsWithConstraints = (constraints: Array<Constraint>) => {
      return {
        docs: null,
        deprecated: null,
        constraints,
      };
    };

    expect(
      document(
        getEmptyDocsWithConstraints([{ kind: "maxLength", value: 200 }]),
      ),
    ).toEqual("/**\n * At most 200 characters long\n */\n");

    expect(
      document(getEmptyDocsWithConstraints([{ kind: "maxLength", value: 1 }])),
    ).toEqual("/**\n * At most 1 character long\n */\n");

    expect(
      document(
        getEmptyDocsWithConstraints([
          { kind: "int" },
          { kind: "maxLength", value: 1 },
        ]),
      ),
    ).toEqual("/**\n * Must be an integer\n * At most 1 character long\n */\n");

    expect(
      document(
        getEmptyDocsWithConstraints([
          { kind: "int" },
          { kind: "maxLength", value: 1 },
        ]),
        1,
      ),
    ).toEqual(
      " /**\n  * Must be an integer\n  * At most 1 character long\n  */\n",
    );
  });

  it("ignores constraints that can be expressed with type definitions", () => {
    const docs = {
      docs: null,
      deprecated: null,
      constraints: [{ kind: "required" } as const],
    };

    expect(document(docs)).toEqual("");
    expect(
      document({
        ...docs,
        constraints: [...docs.constraints, { kind: "maxLength", value: 1 }],
      }),
    ).toEqual("/**\n * At most 1 character long\n */\n");
  });

  test("entity with all documentation properties", () => {
    const docs = {
      docs: "Hello",
      deprecated: "Warning",
      constraints: [
        { kind: "int" } as const,
        { kind: "maxLength", value: 22 } as const,
      ],
    };

    expect(document(docs)).toEqual(
      "/**\n * Hello\n * Must be an integer\n * At most 22 characters long\n * @deprecated Warning\n */\n",
    );
    expect(document(docs, 2)).toEqual(
      "  /**\n   * Hello\n   * Must be an integer\n   * At most 22 characters long\n   * @deprecated Warning\n   */\n",
    );
  });
});
