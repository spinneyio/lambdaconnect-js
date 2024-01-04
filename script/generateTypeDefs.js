const fs = require('fs');
const getValidationSchema = require('./generate-validation-schema');


if (!process.argv[2]) {
  console.error('Provide output path');
  process.exit(1);
}

const path = process.argv[2];

getValidationSchema((schema) => {
  console.log('Generating types...');

  let bigString = '';
  bigString += '// This file is generated. Do not edit it manually.\n\n';
  bigString += 'export type UUID = string;\n\n';
  bigString += 'export type NumericBoolean = 0 | 1;\n\n';

  for (const [name, {attributes, relationships}] of Object.entries(schema)) {
    bigString += `export type ${name} = {\n`;

    for (const [attributeName, attributeType] of Object.entries(attributes)) {
      const isRequired = !!attributeType.constraints?.required
      const isEnum =
        attributeType.type === 'string'
        && !!attributeType.constraints?.regex
        && attributeType.constraints.regex.startsWith('(')
        && attributeType.constraints.regex.endsWith(")")
        && attributeType.constraints.regex.includes('|');

      if (isEnum) {
        const enumValues = attributeType.constraints.regex
          .replace('(', '')
          .replace(')', '')
          .split('|')
          .map(value => `'${value}'`)
          .join(' | ');

        bigString += `  ${attributeName}${isRequired ? ':' : '?:'} ${enumValues};\n`;
        continue;
      }

      bigString += `  ${attributeName}${isRequired ? ':' : '?:'} ${attributeType.type === 'boolean' ? 'NumericBoolean' : attributeType.type};\n`;
    }

    if (relationships) {
      for (const [relationshipName, relationshipType] of Object.entries(relationships)) {
        const isToMany = !!relationshipType.toMany;

        bigString += `  // ${relationshipType.destinationEntity} ${isToMany ? 'uuids' : 'uuid'}\n`
        bigString += `  ${relationshipName}?: ${isToMany ? "Array<UUID>" : "UUID"};\n`;
      }
    }

    bigString += '}\n\n';
  }

  console.log('Writing types to ', path);
  fs.writeFileSync(path, bigString);
  console.log('Done ✨');
})



