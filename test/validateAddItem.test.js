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
      eatTime: {
        type: 'string',
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
          minLength: 0,
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
  }
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

const runValidateFunctionWithMockedData = (mockedObject) => validateDexieAdd({
  objectToAdd: mockedObject,
  validationSchema: validationSchemaFragment,
  tableName: validationTableName,
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

  test('object with wrong typed property throws correct error', () => {
    try {
      runValidateFunctionWithMockedData({
        ...mealItemCorrect,
        energyInKcal: 'twenty',
      });
    } catch (e) {
      expect(e).toBeInstanceOf(DatabaseValidationError);
      expect(e.validationErrorData.object.name).toEqual(mealItemCorrect.name);
      expect(e.validationErrorData.tableName).toEqual(validationTableName);
      expect(e.validationErrorData.failedConstraint).toEqual('typeError');
      expect(e.validationErrorData.badAttribute).toEqual('energyInKcal');
    }
  });

  test("object with string property that doesn't match regex fails validation with correct error", () => {
    try {
      runValidateFunctionWithMockedData({
        ...mealItemCorrect,
        mealType: 'snack',
      });
    } catch (e) {
      expect(e).toBeInstanceOf(DatabaseValidationError);
      expect(e.validationErrorData.failedConstraint).toEqual('regex');
      expect(e.validationErrorData.badAttribute).toEqual('mealType');
    }
  });

  test("object minLength failed fails validation with correct error", () => {
    try {
      runValidateFunctionWithMockedData({
        ...mealItemCorrect,
        nutritionixID: '',
      });
    } catch (e) {
      expect(e).toBeInstanceOf(DatabaseValidationError);
      expect(e.validationErrorData.failedConstraint).toEqual('minLength');
      expect(e.validationErrorData.badAttribute).toEqual('nutritionixID');
    }
  });

  test("object maxValue failed fails validation with correct error", () => {
    try {
      runValidateFunctionWithMockedData({
        ...mealItemCorrect,
        energyInKcal: 999999,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(DatabaseValidationError);
      expect(e.validationErrorData.failedConstraint).toEqual('maxValue');
      expect(e.validationErrorData.badAttribute).toEqual('energyInKcal');
    }
  });

  test("object with additional unknown property fails validation with correct error", () => {
    try {
      runValidateFunctionWithMockedData({
        ...mealItemCorrect,
        test: 'test',
      });
    } catch (e) {
      expect(e).toBeInstanceOf(DatabaseValidationError);
      expect(e.validationErrorData.failedConstraint).toEqual('unknownKey');
      expect(e.validationErrorData.badAttribute).toEqual('test');
    }
  });
})
