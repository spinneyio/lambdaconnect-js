const parser = require('fast-xml-parser');
const he = require('he');
const http = require('http');

function run(onProcessed) {
  console.log('Fetching model')
  http.get('http://testing.telahealth.com/api/v1/data-model', (resp) => {
    let data = '';

    resp.on('data', (chunk) => {
      data += chunk;
    });

    resp.on('end', () => {
      const {success, model} = JSON.parse(data);
      if (!success) {
        console.error("Couldn't fetch model");
        process.exit(1);
      }
      onModelGetEnd(model, onProcessed);
    });
  })
}

const nodeAttributesName = 'attr';
const nodeNamesToDelete = [nodeAttributesName, 'elements'];
const numberTypes = ['Double', 'Integer 64', 'Integer 16', 'Integer 32', 'Float'];
const stringTypes = ['String', 'Date', 'UUID', 'URI'];

const objectsWithNameToNamedObjects = (arrayOfObjectsWithNameProperty) => arrayOfObjectsWithNameProperty
  .reduce((acc, el) => {
    const {name: key, ...rest} = el;
    acc[key] = rest;
    return acc;
  }, {});

const onModelGetEnd = (model, onProcessed) => {
  if (!parser.validate(model)) {
    console.error("Invalid model");
    process.exit(1);
  }

  const options = {
    attributeNamePrefix: "",
    attrNodeName: nodeAttributesName, //default is 'false'
    textNodeName: "#text",
    ignoreAttributes: false,
    ignoreNameSpace: false,
    allowBooleanAttributes: true,
    parseNodeValue: true,
    parseAttributeValue: true,
    trimValues: true,
    parseTrueNumberOnly: false,
    arrayMode: false, //"strict"
    attrValueProcessor: (val, attrName) => he.decode(val, {isAttributeValue: true}),//default is a=>a
    tagValueProcessor: (val, tagName) => he.decode(val), //default is a=>a
    stopNodes: ["element", "elements"]
  };

  const jsonModelWithParseOptions = parser.parse(model, options);

  nodeNamesToDelete.forEach((nodeName) => {
    delete jsonModelWithParseOptions.model[nodeName];
  })

  const entities = jsonModelWithParseOptions.model.entity;

  const objects = entities.map((entity) => {
    const object = {};
    const {name} = entity[nodeAttributesName];
    object.name = name;

    const attributes = entity.attribute.map((attribute) => {
      const attributeValues = attribute[nodeAttributesName];
      let type = 'boolean';
      if (numberTypes.includes(attributeValues.attributeType)) {
        type = 'number';
      }
      if (stringTypes.includes(attributeValues.attributeType)) {
        type = 'string';
      }
      const constraints = {
        required: true,
      };
      if (attributeValues.optional === 'YES') {
        constraints.required = false;
      }
      if (typeof attributeValues.minValueString === 'number') {
        if (type === 'number') {
          constraints.minValue = attributeValues.minValueString;
        } else {
          constraints.minLength = attributeValues.minValueString;
        }
      }
      if (typeof attributeValues.maxValueString === 'number') {
        if (type === 'number') {
          constraints.maxValue = attributeValues.maxValueString;
        } else {
          constraints.maxLength = attributeValues.maxValueString;
        }
      }
      if (attributeValues.regularExpressionString) {
        constraints.regex = attributeValues.regularExpressionString;
      }
      return {
        name: attributeValues.name,
        type,
        constraints,
      }
    });

    object.attributes = objectsWithNameToNamedObjects(attributes);

    if (entity.relationship) {
      object.relationships = objectsWithNameToNamedObjects(
        [...[entity.relationship].flat()].map((relationship) => {
          const {name, toMany, destinationEntity} = relationship[nodeAttributesName];
          return {
            name,
            destinationEntity,
            toMany: toMany === 'YES',
          }
        })
      );
    }

    return object;
  })

  const namedEntities = objectsWithNameToNamedObjects(objects);
  onProcessed(namedEntities)
}

// run((schema) => {
//   fs.writeFileSync("schema.json", JSON.stringify(schema));
// })

module.exports = run;
