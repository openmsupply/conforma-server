// Test suite for the evaluateExpression() function

import evaluateExpression from './evaluateExpression'
import { testData } from './evaluateExpressionTestData'
import * as config from '../../config.json'

const { Client } = require('pg')

//CONFIG -- Postgres DATABASE SETUP:
const pgConnect = new Client(config.pg_database_connection)

pgConnect.connect()

//CONFIG -- GraphQL SETUP
const fetch = require('node-fetch')
const graphQLendpoint = 'http://localhost:5000/graphql'

// Basic (single level literals)

test('Testing basic string literal', () => {
  return evaluateExpression(testData.basicStringLiteral).then((result: any) => {
    expect(result).toBe('First Name')
  })
})

test('Testing basic string literal (Stringified)', () => {
  return evaluateExpression(testData.stringifiedBasicStringLiteral).then((result: any) => {
    expect(result).toBe('First Name')
  })
})

test('Testing basic string literal - no type', () => {
  return evaluateExpression(testData.basicStringLiteralNoType).then((result: any) => {
    expect(result).toBe('First Name')
  })
})

test('Testing basic boolean', () => {
  return evaluateExpression(testData.basicBoolean).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Testing basic boolean (Stringified)', () => {
  return evaluateExpression(testData.stringifiedBasicBoolean).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Testing basic Array', () => {
  return evaluateExpression(testData.basicArray).then((result: any) => {
    expect(result).toEqual(['Pharmaceutical', 'Natural Product', 'Other'])
  })
})

test('Testing basic Array (Stringified)', () => {
  return evaluateExpression(testData.stringifiedBasicArray).then((result: any) => {
    expect(result).toEqual(['Pharmaceutical', 'Natural Product', 'Other'])
  })
})

// AND operator

test('Testing AND operator with 2 children', () => {
  return evaluateExpression(testData.operatorAND_2values).then((result: any) => {
    expect(result).toEqual(true)
  })
})

test('Testing AND operator with 2 children, one false', () => {
  return evaluateExpression(testData.operatorAND_2values_false).then((result: any) => {
    expect(result).toEqual(false)
  })
})

test('Testing AND operator with 4 children', () => {
  return evaluateExpression(testData.operatorAND_4values).then((result: any) => {
    expect(result).toEqual(true)
  })
})

test('Testing AND operator with 4 children, one false', () => {
  return evaluateExpression(testData.operatorAND_4values_false).then((result: any) => {
    expect(result).toEqual(false)
  })
})

// OR operator

test('Testing OR operator with 2 children', () => {
  return evaluateExpression(testData.operatorOR_2values).then((result: any) => {
    expect(result).toEqual(true)
  })
})

test('Testing OR operator with 2 children, one false', () => {
  return evaluateExpression(testData.operatorOR_2values_1false).then((result: any) => {
    expect(result).toEqual(true)
  })
})

test('Testing OR operator with 4 children', () => {
  return evaluateExpression(testData.operatorOR_4values).then((result: any) => {
    expect(result).toEqual(true)
  })
})

test('Testing OR operator with 4 children, 1 false', () => {
  return evaluateExpression(testData.operatorOR_4values_1false).then((result: any) => {
    expect(result).toEqual(true)
  })
})

test('Testing OR operator with 4 children, all false', () => {
  return evaluateExpression(testData.operatorOR_4values_false).then((result: any) => {
    expect(result).toEqual(false)
  })
})

// CONCAT operator

test('Testing Array concatenation', () => {
  return evaluateExpression(testData.CONCAT_2_Arrays).then((result: any) => {
    expect(result).toEqual([1, 2, 3, 'Four', 'Five', 'Six'])
  })
})

test('Testing Array concatenation with 4 children, including nested array', () => {
  return evaluateExpression(testData.CONCAT_4_Arrays).then((result: any) => {
    expect(result).toEqual([
      1,
      2,
      3,
      'Four',
      'Five',
      'Six',
      7,
      8,
      'Nine',
      ['Four', 'Five', 'Six'],
      'The',
      'End',
    ])
  })
})

test('Testing String concatenation', () => {
  return evaluateExpression(testData.CONCAT_3_Strings).then((result: any) => {
    expect(result).toBe('Carl Smith')
  })
})

test('Testing String concatenation with type undefined', () => {
  return evaluateExpression(testData.CONCAT_4_Unspecified).then((result: any) => {
    expect(result).toBe('Carl Smith--XXX')
  })
})

// Equal (=) operator

test('Testing Equality (numbers)', () => {
  return evaluateExpression(testData.EQUAL_Numbers).then((result: any) => {
    expect(result).toBe(true)
  })
})

test("Testing Equality (numbers) -- don't match", () => {
  return evaluateExpression(testData.EQUAL_Numbers_false).then((result: any) => {
    expect(result).toBe(false)
  })
})

test('Testing Equality (strings)', () => {
  return evaluateExpression(testData.EQUAL_String).then((result: any) => {
    expect(result).toBe(true)
  })
})

test("Testing Equality (strings) -- don't match", () => {
  return evaluateExpression(testData.EQUAL_String_false).then((result: any) => {
    expect(result).toBe(false)
  })
})

test('Testing Equality (numbers) -- many', () => {
  return evaluateExpression(testData.EQUAL_Numbers_many).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Testing Equality (strings) -- single child', () => {
  return evaluateExpression(testData.EQUAL_String_single).then((result: any) => {
    expect(result).toBe(true)
  })
})

// Inequality

test('Testing Inequality (numbers)', () => {
  return evaluateExpression(testData.NOT_EQUAL_Numbers).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Testing Inequality (numbers) -- false', () => {
  return evaluateExpression(testData.NOT_EQUAL_Numbers_false).then((result: any) => {
    expect(result).toBe(false)
  })
})

test('Testing Inequality (strings)', () => {
  return evaluateExpression(testData.NOT_EQUAL_String).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Testing Inequality (strings) -- false', () => {
  return evaluateExpression(testData.NOT_EQUAL_String_false).then((result: any) => {
    expect(result).toBe(false)
  })
})

// PLUS (+) operator

test('Testing Adding 2 numbers', () => {
  return evaluateExpression(testData.PLUS_2Nums).then((result: any) => {
    expect(result).toBe(12)
  })
})

test('Testing Adding 4 numbers', () => {
  return evaluateExpression(testData.PLUS_4Nums).then((result: any) => {
    expect(result).toBe(38.6)
  })
})

// REGEX operator

test('Testing Regex - Email validation', () => {
  return evaluateExpression(testData.REGEX_check_email).then((result: any) => {
    expect(result).toBe(true)
  })
})

test('Testing Regex - Email validation', () => {
  return evaluateExpression(testData.REGEX_check_email_false).then((result: any) => {
    expect(result).toBe(false)
  })
})

// Return User or Form values

test('Test returning single user property', () => {
  return evaluateExpression(testData.singleUserProperty, { user: testData.user }).then(
    (result: any) => {
      expect(result).toBe('Carl')
    }
  )
})

// SQL operator

test('Test Postgres lookup single string', () => {
  return evaluateExpression(testData.getApplicationName, { pgConnection: pgConnect }).then(
    (result: any) => {
      expect(result).toBe('Company Registration: Company C')
    }
  )
})

test('Test Postgres get array of template names', () => {
  return evaluateExpression(testData.getListOfTemplates, { pgConnection: pgConnect }).then(
    (result: any) => {
      expect(result).toEqual(['User Registration', 'Company Registration'])
    }
  )
})

test('Test Postgres get Count of templates', () => {
  return evaluateExpression(testData.countTemplates, { pgConnection: pgConnect }).then(
    (result: any) => {
      expect(result).toEqual(2)
    }
  )
})

test('Test Postgres get template names -- no type', () => {
  return evaluateExpression(testData.getListOfTemplates_noType, { pgConnection: pgConnect }).then(
    (result: any) => {
      expect(result).toEqual([{ name: 'User Registration' }, { name: 'Company Registration' }])
    }
  )
})

test('Test Postgres get application list with IDs', () => {
  return evaluateExpression(testData.getListOfApplications_withId, {
    pgConnection: pgConnect,
  }).then((result: any) => {
    expect(result).toEqual([
      { id: 1, name: 'User Registration: Nicole Madruga' },
      { id: 2, name: 'User Registration: Carl Smith' },
      { id: 3, name: 'Company Registration: Company C' },
    ])
  })
})

// GraphQL operator

test('Test GraphQL -- get single application name', () => {
  return evaluateExpression(testData.simpleGraphQL, {
    graphQLConnection: {
      fetch: fetch,
      endpoint: graphQLendpoint,
    },
  }).then((result: any) => {
    expect(result).toEqual('User Registration: Nicole Madruga')
  })
})

test('Test GraphQL -- List of Application Names', () => {
  return evaluateExpression(testData.GraphQL_listOfApplications, {
    graphQLConnection: {
      fetch: fetch,
      endpoint: graphQLendpoint,
    },
  }).then((result: any) => {
    expect(result).toEqual([
      'User Registration: Nicole Madruga',
      'User Registration: Carl Smith',
      'Company Registration: Company C',
    ])
  })
})

test('Test GraphQL -- List of Application Names with Ids', () => {
  return evaluateExpression(testData.GraphQL_listOfApplicationsWithId, {
    graphQLConnection: {
      fetch: fetch,
      endpoint: graphQLendpoint,
    },
  }).then((result: any) => {
    expect(result).toEqual([
      {
        name: 'User Registration: Nicole Madruga',
        id: 1,
      },
      {
        name: 'User Registration: Carl Smith',
        id: 2,
      },
      {
        name: 'Company Registration: Company C',
        id: 3,
      },
    ])
  })
})

test('Test GraphQL -- count Sections on current Application', () => {
  return evaluateExpression(testData.GraphQL_CountApplicationSections, {
    application: testData.application,
    graphQLConnection: {
      fetch: fetch,
      endpoint: graphQLendpoint,
    },
  }).then((result: any) => {
    expect(result).toEqual(2)
  })
})

// TO-DO: Test with multiple variables and dynamic values

// More complex combinations

test('Test concatenate user First and Last names', () => {
  return evaluateExpression(testData.concatFirstAndLastNames, { user: testData.user }).then(
    (result: any) => {
      expect(result).toBe('Carl Smith')
    }
  )
})

test('Test concatenate user First and Last names', () => {
  return evaluateExpression(testData.concatFirstAndLastNames, { user: testData.user }).then(
    (result: any) => {
      expect(result).toBe('Carl Smith')
    }
  )
})

// test("Test visibility condition -- Answer to Q1 is Drug Registration and user belongs to at least one organisation", () => {
//   expect(evaluateExpression(testData.complex1, { form: testData.form, user: testData.user })).toEqual(true);
// });

// These don't work yet -- need GraphQL operator to be implemented

// test('Test Trigger condition -- Stage = 1 (Screening) and All Questions are approved', () => {
//   return evaluateExpression(testData.complex2, {
//     application: testData.application,
//   }).then((result: any) => {
//     expect(result).toBe(true);
//   });
// });

// test('Test Trigger condition -- Stage = 1 (Screening) and All Questions are approved -- input as Stringified JSON', () => {
//   return evaluateExpression(testData.complex2_asString, {
//     application: testData.application,
//   }).then((result: any) => {
//     expect(result).toBe(true);
//   });
// });

afterAll(() => {
  pgConnect.end()
})

// Write some tests for showing error conditions
