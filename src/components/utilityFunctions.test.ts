import {
  objectKeysToCamelCase,
  objectKeysToSnakeCase,
  filterObject,
  modifyValueInObject,
} from './utilityFunctions'

test('Convert object to camelCase', () => {
  expect(objectKeysToCamelCase({ snake_key_1: 1, otherCaseKey: 2 })).toEqual({
    snakeKey1: 1,
    otherCaseKey: 2,
  })
})

test('Convert object to snake_case', () => {
  expect(objectKeysToSnakeCase({ camelCase1: 1, UPPER_CASE: 2, TitleCase: 3 })).toEqual({
    camel_case_1: 1,
    upper_case: 2,
    title_case: 3,
  })
})
const testObject = {
  one: 1,
  twoString: 'two',
  zero: 0,
  falseValue: false,
  nullValue: null,
  undefinedValue: undefined,
  arrayValue: [1, 2, 'three'],
  objectValue: { one: 1, two: 'two', nullValue: null },
}
test('Filter object using default filter function', () => {
  expect(filterObject(testObject)).toEqual({
    one: 1,
    twoString: 'two',
    zero: 0,
    falseValue: false,
    arrayValue: [1, 2, 'three'],
    objectValue: { one: 1, two: 'two', nullValue: null },
  })
})

test('Filter object using custom filter for any falsy value', () => {
  expect(filterObject(testObject, (x) => x)).toEqual({
    one: 1,
    twoString: 'two',
    arrayValue: [1, 2, 'three'],
    objectValue: { one: 1, two: 'two', nullValue: null },
  })
})

test(`Check modify in object`, () => {
  return expect(
    modifyValueInObject(
      {
        something: { $from: 'yow' },
        somethingElse: { nested: [], alsoNested: { $from: 'hi' } },
      },
      (key, value) => key == '$from' && typeof value == 'string',
      (value) => `private.${value}`
    )
  ).toEqual({
    something: { $from: 'private.yow' },
    somethingElse: { nested: [], alsoNested: { $from: 'private.hi' } },
  })
})
