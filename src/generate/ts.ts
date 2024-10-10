import { IR } from "./ir.ts";
import document from "./document.ts";

export default function generateTypescriptDefinitionFileFromIr(ir: IR) {
  let fileString = ``;

  ir.forEach((entity) => {
    fileString += document(entity);
    fileString += `export type ${entity.name} = {\n`;
    entity.attributes.forEach((attr) => {
      fileString += document(attr, 2);

      let isOptional = true;
      let m1Arg = "";
      attr.constraints.forEach((c) => {
        if (c.kind === "required") {
          isOptional = false;
          return;
        }

        if (c.kind === "enum") {
          c.value;
          m1Arg = `${c.value.map((enumMember) => `"${enumMember}"`).join(" | ")}`;
          return;
        }
      });

      fileString += `  ${attr.name}${isOptional ? "?" : ""}: ${m1Arg || attr.type},\n`;
    });

    entity.relations.forEach((rel) => {
      fileString += document(rel, 2);

      fileString += `  ${rel.name}?: ${rel.toMany ? "Array<string>" : "string"}, // ${rel.destinationEntity}\n`;
    });

    fileString += `};\n\n`;
  });

  fileString += `export type EntityMap = {\n`;
  ir.forEach((entity) => {
    fileString += `  ${entity.name}: ${entity.name};\n`;
  });
  fileString += `};\n`;

  return fileString;
}
