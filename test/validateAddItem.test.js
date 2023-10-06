import validateDexieAdd from "../src/utils/validateDexieAdd";
import DatabaseValidationError from "../src/errors/DatabaseValidationError";

const validationSchemaFragment = {
  NOMealDetails: {
    attributes: {
      active: {
        type: 'boolean',
        constraints: {
          required: true,
        }
      },
      fakeBoolean: {
        type: 'boolean',
        constraints: {
          required: false,
        }
      },
      eatTime: {
        type: 'date',
        constraints: {
          required: true,
        }
      },
      energyInKcal: {
        type: 'number',
        constraints: {
          required: true,
          minValue: 0,
          maxValue: 100000,
        }
      },
      name: {
        type: 'string',
        constraints: {
          required: true,
          minLength: 0,
          maxLength: 100,
        }
      },
      nutritionixID: {
        type: 'string',
        constraints: {
          required: false,
          minLength: 1,
          maxLength: 100,
        }
      },
      mealType: {
        type: 'string',
        constraints: {
          required: true,
          regex: '(Breakfast|Snack|Lunch|Dinner|Supper)',
          minLength: 1,
        }
      }
    },
  },
  NOUser: {
    attributes: {
      fullName: {
        type: 'string',
        constraints: {
          required: true,
          minLength: 1,
          maxLength: 100,
        },
      },
      gender: {
        type: 'string',
        constraints: {
          minLength: 1,
          regex: '(Male|Female|Other)'
        }
      }
    },
    relationships: {
      messagesReceived: {
        destinationEntity: "NOMessage",
        toMany: true
      },
      dietitian: {
        destinationEntity: "NODietitian",
        toMany: false
      }
    }
  },
};

const validationTableName = 'NOMealDetails';

const mealItemCorrect = {
  active: 0,
  eatTime: new Date('05 October 2011 14:48 UTC').toISOString(),
  energyInKcal: 100,
  name: 'Somedwich',
  nutritionixID: '7',
  mealType: 'Snack'
};

const userCorrect = {
  fullName: 'Jane Doe',
  gender: undefined,
  dietitian: "id1",
  messagesReceived: ["id1", "id2"],
}

const runValidateFunctionWithMockedData = (mockedObject, tableName = validationTableName) => validateDexieAdd({
  objectToAdd: mockedObject,
  validationSchema: validationSchemaFragment,
  tableName,
})

describe('add validation', () => {
  test('correct object passes validation', () => {
    expect(() => runValidateFunctionWithMockedData(mealItemCorrect)).not.toThrow();
  });

  test('object without automatically appended required property passes validation', () => {
    expect(() => runValidateFunctionWithMockedData({
      ...mealItemCorrect,
      active: undefined,
    })).not.toThrow();
  });

  test('object without required property fails validation', () => {
    expect(() => runValidateFunctionWithMockedData({
      ...mealItemCorrect,
      energyInKcal: undefined,
    })).toThrow(DatabaseValidationError);
  });

  test('object with correct optional property', () => {
    expect(() => runValidateFunctionWithMockedData({
      ...mealItemCorrect,
      fakeBoolean: 1,
    })).not.toThrow();
  })

  test('object with numeric boolean property different than 0 or 1', () => {
    expect(() => {
      try {
        runValidateFunctionWithMockedData({
          ...mealItemCorrect,
          fakeBoolean: 3,
        })
      } catch (e) {
        expect(e).toBeInstanceOf(DatabaseValidationError);
        expect(e.validationErrorData.failedConstraint).toEqual('typeError');
        expect(e.validationErrorData.badAttribute).toEqual('fakeBoolean');
      }
    })
  })

  test('object with wrong typed property throws correct error', () => {
    const typeErrorMealItem = {
      ...mealItemCorrect,
      energyInKcal: 'twenty',
    }

    expect(() => runValidateFunctionWithMockedData(typeErrorMealItem)).toThrow(DatabaseValidationError);

    try {
      runValidateFunctionWithMockedData(typeErrorMealItem);
    } catch (e) {
      expect(e).toBeInstanceOf(DatabaseValidationError);
      expect(e.validationErrorData.object.name).toEqual(mealItemCorrect.name);
      expect(e.validationErrorData.tableName).toEqual(validationTableName);
      expect(e.validationErrorData.failedConstraint).toEqual('typeError');
      expect(e.validationErrorData.badAttribute).toEqual('energyInKcal');
    }
  });

  test("object with string property that doesn't match regex fails validation with correct error", () => {
    const regexFailedMealItem = {
      ...mealItemCorrect,
      mealType: 'snack',
    }

    expect(() => runValidateFunctionWithMockedData(regexFailedMealItem)).toThrow(DatabaseValidationError);

    try {
      runValidateFunctionWithMockedData(regexFailedMealItem);
    } catch (e) {
      expect(e).toBeInstanceOf(DatabaseValidationError);
      expect(e.validationErrorData.failedConstraint).toEqual('regex');
      expect(e.validationErrorData.badAttribute).toEqual('mealType');
    }
  });

  test("object minLength failed fails validation with correct error", () => {
    const minLengthFailedMealItem = {
      ...mealItemCorrect,
      nutritionixID: '',
    }

    expect(() => runValidateFunctionWithMockedData(minLengthFailedMealItem)).toThrow(DatabaseValidationError)

    try {
      runValidateFunctionWithMockedData(minLengthFailedMealItem);
    } catch (e) {
      expect(e).toBeInstanceOf(DatabaseValidationError);
      expect(e.validationErrorData.failedConstraint).toEqual('minLength');
      expect(e.validationErrorData.badAttribute).toEqual('nutritionixID');
    }
  });

  test("object maxValue failed fails validation with correct error", () => {
    const maxValueFailedMealItem = {
      ...mealItemCorrect,
      energyInKcal: 999999,
    }

    expect(() => runValidateFunctionWithMockedData(maxValueFailedMealItem)).toThrow(DatabaseValidationError)

    try {
      runValidateFunctionWithMockedData(maxValueFailedMealItem);
    } catch (e) {
      expect(e).toBeInstanceOf(DatabaseValidationError);
      expect(e.validationErrorData.failedConstraint).toEqual('maxValue');
      expect(e.validationErrorData.badAttribute).toEqual('energyInKcal');
    }
  });

  test("object with additional unknown property fails validation with correct error", () => {
    const unknownPropertyMealItem = {
      ...mealItemCorrect,
      test: 'test',
    }

    expect(() => runValidateFunctionWithMockedData(unknownPropertyMealItem)).toThrow(DatabaseValidationError)

    try {
      runValidateFunctionWithMockedData(unknownPropertyMealItem);
    } catch (e) {
      expect(e).toBeInstanceOf(DatabaseValidationError);
      expect(e.validationErrorData.failedConstraint).toEqual('unknownKey');
      expect(e.validationErrorData.badAttribute).toEqual('test');
    }
  });

  test("object with undefined non-required property passes", () => {
    expect(() => runValidateFunctionWithMockedData(userCorrect, 'NOUser')).not.toThrow();
  });
})


describe("relationship validations", () => {
  test("string passed to a \"toMany\" relation throws appropriate error", () => {
    const objectWithBadToManyRelation = {
      ...userCorrect,
      messagesReceived: "id1",
    };

    expect(() => runValidateFunctionWithMockedData(objectWithBadToManyRelation, 'NOUser')).toThrow(DatabaseValidationError)

    try {
      runValidateFunctionWithMockedData(objectWithBadToManyRelation, 'NOUser')
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseValidationError);
      expect(error.validationErrorData.failedConstraint).toEqual('toMany');
      expect(error.validationErrorData.badAttribute).toEqual('messagesReceived');
    }
  });

  test("array of strings passed to a \"toOne\" relation throws appropriate error", () => {
    const array = ["id1"];
    const objectWithBadToOneRelation = {
      ...userCorrect,
      dietitian: array,
    };

    expect(() => runValidateFunctionWithMockedData(objectWithBadToOneRelation, 'NOUser')).toThrow(DatabaseValidationError)

    try {
      runValidateFunctionWithMockedData(objectWithBadToOneRelation, 'NOUser')
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseValidationError);
      expect(error.validationErrorData.failedConstraint).toEqual('toOne');
      expect(error.validationErrorData.badAttribute).toEqual('dietitian');
    }

    expect(() => runValidateFunctionWithMockedData(objectWithBadToOneRelation, 'NOUser')).toThrow()
  });

  test("undefined passed to a \"toOne\" relation passes", () => {
    expect(() => runValidateFunctionWithMockedData({
      ...userCorrect,
      dietitian: undefined,
    }, 'NOUser')).not.toThrow();
  })

  test("undefined passed to a \"toMany\" relation passes", () => {
    expect(() => runValidateFunctionWithMockedData({
      ...userCorrect,
      messagesReceived: undefined,
    }, 'NOUser')).not.toThrow();
  })

  test("array of not strings passed to a \"toMany\" relation throws appropriate error", () => {
    const notStrings = [1, "null", null, new Date()];
    const objectWithNonStringToManyRelations = {
      ...userCorrect,
      messagesReceived: notStrings,
    };

    expect(() => runValidateFunctionWithMockedData(objectWithNonStringToManyRelations, 'NOUser')).toThrow(DatabaseValidationError)

    try {
      runValidateFunctionWithMockedData(objectWithNonStringToManyRelations, 'NOUser')
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseValidationError);
      expect(error.validationErrorData.failedConstraint).toEqual('toMany');
      expect(error.validationErrorData.badAttribute).toEqual('messagesReceived');
    }
  });

  test("not string passed to a \"toMany\" relation fails with appropriate error", () => {
    const notString = 1;
    const objectWithNonStringToManyRelations = {
      ...userCorrect,
      dietitian: notString,
    };

    expect(() => runValidateFunctionWithMockedData(objectWithNonStringToManyRelations, 'NOUser')).toThrow(DatabaseValidationError)

    try {
      runValidateFunctionWithMockedData(objectWithNonStringToManyRelations, 'NOUser')
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseValidationError);
      expect(error.validationErrorData.failedConstraint).toEqual('toOne');
      expect(error.validationErrorData.badAttribute).toEqual('dietitian');
    }
  })
})
