const fs = require('fs');
const parser = require('fast-xml-parser');
const he = require('he');

if (!process.argv[2]) {
  console.error('No XML file path provided.');
  process.exit(1);
}

const xmlData = fs.readFileSync(process.argv[2], {encoding: 'utf8'});

if(!parser.validate(xmlData)) { //optional (it'll return an object in case it's not valid)
  console.error('Incorrect XML file');
  process.exit(1);
}

const options = {
  attributeNamePrefix : "@_",
  attrNodeName: "attr", //default is 'false'
  textNodeName : "#text",
  ignoreAttributes : false,
  ignoreNameSpace : false,
  allowBooleanAttributes : true,
  parseNodeValue : true,
  parseAttributeValue : true,
  trimValues: true,
  cdataTagName: "__cdata", //default is 'false'
  cdataPositionChar: "\\c",
  parseTrueNumberOnly: false,
  arrayMode: false, //"strict"
  attrValueProcessor: (val, attrName) => he.decode(val, {isAttributeValue: true}),//default is a=>a
  tagValueProcessor : (val, tagName) => he.decode(val), //default is a=>a
  stopNodes: ["parse-me-as-string"]
};

const jsonObj = parser.parse(xmlData, options);

const schema = {
  version: 1,
  entities: {},
};

try {
  console.log(jsonObj);
  const entities = jsonObj.model.entity;

  for (const entity of entities){
    console.log(entity);
    const entitySchema = {
      name: entity.attr['@_name'],
      syncable: entity.attr['@_syncable'] === 'YES',
      attributes: {},
    };
    for (const {attr} of entity.attribute) {
      const attributeSchema = {
        name: attr['@_name'],
        optional: attr['@_optional'] === 'YES',
        attributeType: attr['@_attributeType'],
        syncable: attr['@_syncable'] === 'YES',
        indexed: false,
      };
      entitySchema.attributes[attributeSchema.name] = attributeSchema;
    }
    schema.entities[entitySchema.name] = entitySchema;
  }

  const outputFile = process.argv[3] || 'output-model.json';

  fs.writeFileSync(outputFile, JSON.stringify(schema, null, 2));
  console.log(`Schema saved to ${outputFile}`);
} catch (error) {
  console.error('Error while parsing XML model', error);
  process.exit(1);
}


