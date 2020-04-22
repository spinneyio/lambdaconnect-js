//@flow
import parser from 'fast-xml-parser';
import he from 'he';

export type DatabaseModel = {
  version: number,
  entities: {
    [string]: DatabaseModelEntity,
  },
};

export type DatabaseModelEntity = {
  name: string,
  syncable: boolean,
  attributes: {
    [string]: DatabaseModelEntityAttribute,
  },
};

export type DatabaseModelEntityAttribute = {
  name: string,
  optional: boolean,
  attributeType: string,
  syncable: boolean,
  indexed: true,
};

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

export default (xmlData: string) : DatabaseModel => {
  const schema = {
    version: 1,
    entities: {},
  };

  const jsonObj = parser.parse(xmlData, options);
  const entities = jsonObj.model.entity;

  for (const entity of entities){
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

    if (entity.relationship) {
      for (const {attr} of Array.isArray(entity.relationship) ? entity.relationship : [entity.relationship]) {
        const attributeSchema = {
          name: attr['@_name'],
          optional: attr['@_optional'] === 'YES',
          attributeType: 'relationship',
          syncable: attr['@_syncable'] === 'YES',
          toMany: attr['@_toMany'] === 'YES',
        };
        entitySchema.attributes[attributeSchema.name] = attributeSchema;
      }
    }

    schema.entities[entitySchema.name] = entitySchema;
  }

  return schema;
}
