import { IR } from "./ir.ts";
import document from "./document.ts";

const typeToZodSchemaMethod = {
  boolean: "boolean",
  Date: "date",
  string: "string",
  enum: "enum",
  number: "number",
} as const;

export default function generateZodFileFromIr(ir: IR) {
  let fileString = `import { z } from "zod";\n\n`;

  ir.forEach((entity) => {
    fileString += document(entity);
    fileString += `export const ${entity.name}Schema = z.object({\n`;
    entity.attributes.forEach((attr) => {
      fileString += document(
        { docs: attr.docs, deprecated: attr.deprecated },
        2,
      );

      let constraints = "";
      let isOptional = true;
      let m1Arg = "";
      attr.constraints.forEach((c) => {
        if (c.kind === "required") {
          isOptional = false;
          return;
        }

        if (c.kind === "enum") {
          c.value;
          m1Arg = `[${c.value.map((enumMember) => `"${enumMember}"`).join(", ")}]`;
          return;
        }

        if (c.kind === "int") {
          constraints += ".int()";
        }

        if (c.kind === "url") {
          constraints += ".url()";
        }

        if (c.kind === "uuid") {
          constraints += ".uuid()";
        }

        if (c.kind === "minValue" || c.kind === "minLength") {
          constraints += `.min(${c.value})`;
          return;
        }

        if (c.kind === "maxValue" || c.kind === "maxLength") {
          constraints += `.max(${c.value})`;
          return;
        }

        if (c.kind === "regex") {
          constraints += `.regex(${c.value})`;
        }
      });

      const m1 = typeToZodSchemaMethod[attr.type];
      fileString += `  ${attr.name}: z.${m1}(${m1Arg || ""})${constraints}${isOptional ? ".optional()" : ""},\n`;
    });

    entity.relations.forEach((rel) => {
      fileString += document(rel, 2);

      fileString += `  ${rel.name}: z.string().uuid().array()${rel.toMany ? "" : ".length(1)"}.optional(), // ${rel.destinationEntity}\n`;
    });

    fileString += `});\n\n`;
  });

  ir.forEach((entity) => {
    fileString += `export type ${entity.name} = z.infer<typeof ${entity.name}Schema>;\n`;
  });

  fileString += `\n`;

  return fileString;
}
