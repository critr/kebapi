/**
 * A quick, home brew asynchronous test runner that performs and logs various tests against our REST API and other modules.
 * 
 * Uses the Node JS built-in assert library to evaluate test cases.
 * 
 * */

'use strict';

const assert = require('assert');

const logger = require('./logger');
const { ConsoleCodes } = require('./logger');
const api = require('./api');
const dal = require('./dal');
const { Role } = require('./roles');
const { pick } = require('./helper-obj');


(function initialise() {
    logger.info('> initialise');

    // Set permissions for actions. Any action called by the server will need these.
    try {
        let permissions = [

            // role admin
            //{ action: runTests, minRole: Role.ADMIN, hasOwner: false }
            { action: runAdminTests, minRole: Role.ADMIN, hasOwner: false }

            // role user (user can access if ids match, otherwise only admin can)
            // None yet.

            // role everyone
            // None yet.
        ];

        // Add the assigned role and owner flag to each api action, as a properties of that fn
        for (const item of permissions) {
            item.action.minRole = item.minRole;
            item.action.hasOwner = item.hasOwner;
        }
    }
    catch (err) {
        logger.error(err);
        //Don't throw unless this fn is wrapped in the future because it won't be caught by anything and stop the server.
    }
    logger.info('< initialise');
})();


// Collection of tests. Each test can run 1+ test cases. Each with varying asserts.
// These tests are intended to be run only by an admin-level account.
const adminTestCollection = {
    /* TODO: 'test' arg is the name of the test, which we should be able to get from some 
     * flavour of Object.keys/entries(this) instead of passing it in.*/
    /* TODO: Weigh abstracting out the calls to runTestCases and making this a pure data structure.
     */
    'dal.resetTestDB should return true': async (test) => {
        let testCases = [
            {
                given: null, // No arguments
                expected: true,
                testFn: dal.resetTestDB,
                assertFn: assert.equal
            }
        ];
        return await runTestCases(test, testCases);
    },
    'dal.checkDBExists should return true': async (test) => {
        let testCases = [
            {
                given: null, // No arguments
                expected: true,
                testFn: dal.checkDBExists,
                assertFn: assert.equal
            }
        ];
        return await runTestCases(test, testCases);
    },
    'dal.setTargetDB should return true': async (test) => {
        let testCases = [
            {
                given: null, // No arguments
                expected: true,
                testFn: dal.setTargetDB,
                assertFn: assert.equal
            }
        ];
        return await runTestCases(test, testCases);
    },
    'dal.checkTablesExist should match Object': async (test) => {
        let testCases = [
            {
                given: null, // No arguments
                expected: { allExist: true, notFound: Array(0) },
                testFn: dal.checkTablesExist,
                assertFn: assert.deepEqual
            }
        ];
        return await runTestCases(test, testCases);
    },
    'api.loginUser should login with correct username and pwd': async (test) => {
        // We test against field subset because response usually includes a hash that changes on every login making comparisons impossible otherwise.
        let testFn = async (given) => { let result = await api.loginUser(given); return getResultSubset(result, ['responseCode', 'responseStatus']); };
        let assertFn = assert.deepEqual;
        let testCases = [
            {
                given: { username: 'aard', password: 'bob1' },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK"
                },
                testFn: testFn,
                assertFn: assertFn
            }
        ];

        return await runTestCases(test, testCases);
    },
    'api.loginUser should login with correct email and pwd': async (test) => {
        // We test against field subset because response usually includes a hash that changes on every login making comparisons impossible otherwise.
        let testFn = async (given) => { let result = await api.loginUser(given); return getResultSubset(result, ['responseCode', 'responseStatus']); };
        let assertFn = assert.deepEqual;
        let testCases = [
            {
                given: { email: 'aard@smithers.com', password: 'bob1' },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK"
                },
                testFn: testFn,
                assertFn: assertFn
            }
        ];

        return await runTestCases(test, testCases);
    },
    'api.loginUser should not login with incorrect email and correct pwd and return expected Object': async (test) => {
        let testFn = api.loginUser;
        let assertFn = assert.deepEqual;
        let testCases = [
            {
                given: { email: 'banana', password: 'bob1' },
                expected: {
                    "responseCode": 404,
                    "responseStatus": "Not Found",
                    "response": "Can't find that user"
                },
                testFn: testFn,
                assertFn: assertFn
            }
        ];

        return await runTestCases(test, testCases);
    },
    'api.getUsers should return expected Object with expected rows': async (test) => {
        // Using same test and assert fns throughout
        let testFn = api.getUsers;
        let assertFn = assert.deepEqual;
        let testCases = [
            {
                given: { startRow: 0, maxRows: 0 },
                expected: { responseCode: 200, responseStatus: "OK", response: Array(0) },
                testFn: testFn,
                assertFn: assertFn
            },
            {
                given: { startRow: 1, maxRows: 2 },
                expected: { responseCode: 200, responseStatus: "OK", response: [{ id: 2, username: "Babs" }, { id: 5, username: "ItsGigi" }] },
                testFn: testFn,
                assertFn: assertFn
            },
            {
                given: {},
                expected: { responseCode: 200, responseStatus: "OK", response: [{ id: 1, username: "aard" }, { id: 2, username: "Babs" }, { id: 5, username: "ItsGigi" }, { id: 4, username: "kAb0000B" }, { id: 3, username: "MeatyMan" }] },
                testFn: testFn,
                assertFn: assertFn
            },
            {
                given: { startRow: 2, maxRows: 7 },
                expected: { responseCode: 200, responseStatus: "OK", response: [{ id: 5, username: "ItsGigi" }, { id: 4, username: "kAb0000B" }, { id: 3, username: "MeatyMan" }] },
                testFn: testFn,
                assertFn: assertFn
            },
            {
                given: { undefined, maxRows: 2 },
                expected: { responseCode: 200, responseStatus: "OK", response: [{ id: 1, username: "aard" }, { id: 2, username: "Babs" }] },
                testFn: testFn,
                assertFn: assertFn
            },
            {
                given: { startRow: 2, undefined },
                expected: { responseCode: 200, responseStatus: "OK", response: [{ id: 5, username: "ItsGigi" }, { id: 4, username: "kAb0000B" }, { id: 3, username: "MeatyMan" }] },
                testFn: testFn,
                assertFn: assertFn
            }
        ];

        return await runTestCases(test, testCases);
    },
    /* TODO: This commented out test uses Object Destructuring and Property Shorthand, and might 
        * be a cleaner implemtation. However, refactoring it into a fn with a shorthand arg hasn't been 
        * possible so far. i.e. how to call: 
        * 
        * fn(arg1, arg2, {id, name})
        * 
        * without the third arg, which is Property Shorthand, being interpreted as an object without
        * values? Review.
        * */
    //'api.getUser should return expected fields': async (test) => {
    //    let testCases = [
    //        {
    //            given: { id: 1 },
    //            expected: { id: 1, username: "aard", name: "Bob" },
    //            testFn: async (given) => {
    //                let result;
    //                let testResult = await api.getUser(given);
    //                if (testResult && testResult.response && testResult.response[0]) {
    //                    // Use only a subset of the returned fields for this test case
    //                    result = (({ id, username, name }) => ({ id, username, name }))(testResult.response[0]); // This uses Object Destructuring and Property Shorthand
    //                }
    //                return result;
    //            },
    //            assertFn: assert.deepEqual
    //        }
    //    ];

    //    return await runTestCases(test, testCases);
    //},

    'api.getUser existing user should return expected fields': async (test) => {
        // Existing users will have response[0] in the response object. Do not include non-existing users with this test function.
        let testFn = async (given) => { let result = await api.getUser(given); return getResultSubset(result.response[0], ['id', 'username', 'name']); };
        let assertFn = assert.deepEqual;
        let testCases = [
            {
                given: { id: 1 },
                expected: { id: 1, username: "aard", name: "Bob" },
                testFn: testFn,
                assertFn: assertFn
            },
            {
                given: { id: 2 },
                expected: { id: 2, username: "Babs", name: "Lucy" },
                testFn: testFn,
                assertFn: assertFn
            },
            {
                given: { id: 3 },
                expected: { id: 3, username: "MeatyMan", name: "Percy" },
                testFn: testFn,
                assertFn: assertFn
            },
            {
                given: { id: 4 },
                expected: { id: 4, username: "kAb0000B", name: "Farquhar" },
                testFn: testFn,
                assertFn: assertFn
            }
        ];

        return await runTestCases(test, testCases);
    },
    'api.getUser non-existing user should return expected Object': async (test) => {
        let testFn = api.getUser;
        let assertFn = assert.deepEqual;
        let testCases = [
            {
                given: { id: 7742 },
                expected: {
                    "responseCode": 404,
                    "responseStatus": "Not Found",
                    "response": []
                },
                testFn: testFn,
                assertFn: assertFn
            }
        ];

        return await runTestCases(test, testCases);
    },
    'api.GetUserFavourites should return expected Object with expected rows': async (test) => {
        let testFn = api.getUserFavourites;
        let assertFn = assert.deepEqual;
        let testCases = [
            {
                given: { id: 1 },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": [
                        {
                            "id": 5,
                            "name": "The Dirty One"
                        },
                        {
                            "id": 4,
                            "name": "The Rotisserie"
                        }
                    ]
                },
                testFn: testFn,
                assertFn: assertFn
            },
            {
                given: { id: 2 },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": [
                        {
                            "id": 3,
                            "name": "Meats Peeps"
                        },
                        {
                            "id": 2,
                            "name": "The Kebaberie"
                        },
                        {
                            "id": 4,
                            "name": "The Rotisserie"
                        }
                    ]
                },
                testFn: testFn,
                assertFn: assertFn
            },
            {
                given: { id: 3 },
                expected: {
                    "responseCode": 404,
                    "responseStatus": "Not Found",
                    "response": []
                },
                testFn: testFn,
                assertFn: assertFn
            },
            {
                given: { id: 4 },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": [
                        {
                            "id": 6,
                            "name": "Bodrum Conundrum"
                        }
                    ]
                },
                testFn: testFn,
                assertFn: assertFn
            },
            {
                given: { id: 77 },
                expected: {
                    "responseCode": 404,
                    "responseStatus": "Not Found",
                    "response": []
                },
                testFn: testFn,
                assertFn: assertFn
            }
        ];

        return await runTestCases(test, testCases);
    },
    'api.addUserFavourite/api.getUserFavourites adding new favourite should result in added favourite': async (test) => {
        let testFnSet = api.addUserFavourite;
        let testFnGet = api.getUserFavourites;
        let assertFn = assert.deepEqual;
        let testCases = [
            {
                given: { id: 1, venueId: 1 },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": 7
                },
                testFn: testFnSet,
                assertFn: assertFn
            },
            {
                given: { id: 1 },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": [
                        {
                            "id": 1,
                            "name": "Splendid Kebabs"
                        },
                        {
                            "id": 5,
                            "name": "The Dirty One"
                        },
                        {
                            "id": 4,
                            "name": "The Rotisserie"
                        }
                    ]
                },
                testFn: testFnGet,
                assertFn: assertFn
            }
        ];

        return await runTestCases(test, testCases);
    },
    'api.addUserFavourite/api.getUserFavourites adding existing favourite should result in unchanged favourites': async (test) => {
        let testFnSet = api.addUserFavourite;
        let testFnGet = api.getUserFavourites;
        let assertFn = assert.deepEqual;
        let testCases = [
            {
                given: { id: 1, venueId: 1 },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": 0
                },
                testFn: testFnSet,
                assertFn: assertFn
            },
            {
                given: { id: 1 },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": [
                        {
                            "id": 1,
                            "name": "Splendid Kebabs"
                        },
                        {
                            "id": 5,
                            "name": "The Dirty One"
                        },
                        {
                            "id": 4,
                            "name": "The Rotisserie"
                        }
                    ]
                },
                testFn: testFnGet,
                assertFn: assertFn
            }
        ];

        return await runTestCases(test, testCases);
    },
    'api.addUserFavourite/api.getUserFavourites adding second new favourite should result in added favourite': async (test) => {
        let testFnSet = api.addUserFavourite;
        let testFnGet = api.getUserFavourites;
        let assertFn = assert.deepEqual;
        let testCases = [
            {
                given: { id: 1, venueId: 2 },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": 9
                },
                testFn: testFnSet,
                assertFn: assertFn
            },
            {
                given: { id: 1 },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": [
                        {
                            "id": 1,
                            "name": "Splendid Kebabs"
                        },
                        {
                            "id": 5,
                            "name": "The Dirty One"
                        },
                        {
                            "id": 2,
                            "name": "The Kebaberie"
                        },
                        {
                            "id": 4,
                            "name": "The Rotisserie"
                        }
                    ]
                },
                testFn: testFnGet,
                assertFn: assertFn
            }

        ];

        return await runTestCases(test, testCases);
    },
    'api.removeUserFavourite/api.getUserFavourites removing a favourite should result in removed favourite': async (test) => {
        let testFnSet = api.removeUserFavourite;
        let testFnGet = api.getUserFavourites;
        let assertFn = assert.deepEqual;
        let testCases = [
            {
                given: { id: 1, venueId: 2 },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": true
                },
                testFn: testFnSet,
                assertFn: assertFn
            },
            {
                given: { id: 1 },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": [
                        {
                            "id": 1,
                            "name": "Splendid Kebabs"
                        },
                        {
                            "id": 5,
                            "name": "The Dirty One"
                        },
                        {
                            "id": 4,
                            "name": "The Rotisserie"
                        }
                    ]
                },
                testFn: testFnGet,
                assertFn: assertFn
            }
        ];

        return await runTestCases(test, testCases);
    },
    'api.removeUserFavourite/api.getUserFavourites removing an already removed favourite should result in no change in favourites': async (test) => {
        let testFnSet = api.removeUserFavourite;
        let testFnGet = api.getUserFavourites;
        let assertFn = assert.deepEqual;
        let testCases = [
            {
                given: { id: 1, venueId: 2 },
                expected: {
                    "responseCode": 400,
                    "responseStatus": "Bad Request",
                    "response": false
                },
                testFn: testFnSet,
                assertFn: assertFn
            },
            {
                given: { id: 1 },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": [
                        {
                            "id": 1,
                            "name": "Splendid Kebabs"
                        },
                        {
                            "id": 5,
                            "name": "The Dirty One"
                        },
                        {
                            "id": 4,
                            "name": "The Rotisserie"
                        }
                    ]
                },
                testFn: testFnGet,
                assertFn: assertFn
            }
        ];

        return await runTestCases(test, testCases);
    },
    'api.removeUserFavourite/api.getUserFavourites removing a second favourite should result in removed favourite': async (test) => {
        let testFnSet = api.removeUserFavourite;
        let testFnGet = api.getUserFavourites;
        let assertFn = assert.deepEqual;
        let testCases = [
            {
                given: { id: 1, venueId: 1 },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": true
                },
                testFn: testFnSet,
                assertFn: assertFn
            },
            {
                given: { id: 1 },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": [
                        {
                            "id": 5,
                            "name": "The Dirty One"
                        },
                        {
                            "id": 4,
                            "name": "The Rotisserie"
                        }
                    ]
                },
                testFn: testFnGet,
                assertFn: assertFn
            }
        ];

        return await runTestCases(test, testCases);
    },
    'api.removeUserFavourite removing a non-existing favourite should return expected Object': async (test) => {
        let testFn = api.removeUserFavourite;
        let assertFn = assert.deepEqual;
        let testCases = [
            {
                given: { id: 1, venueId: 27 },
                expected: {
                    "responseCode": 400,
                    "responseStatus": "Bad Request",
                    "response": false
                },
                testFn: testFn,
                assertFn: assertFn
            }
        ];

        return await runTestCases(test, testCases);
    },
    'api.removeUserFavourite removing a favourite from non-existing user should return expected Object': async (test) => {
        let testFn = api.removeUserFavourite;
        let assertFn = assert.deepEqual;
        let testCases = [
            {
                given: { id: 444, venueId: 1 },
                expected: {
                    "responseCode": 400,
                    "responseStatus": "Bad Request",
                    "response": false
                },
                testFn: testFn,
                assertFn: assertFn
            }
        ];

        return await runTestCases(test, testCases);
    },
    'api.getVenue should return expected fields': async (test) => {
        let testFn = async (given) => { let result = await api.getVenue(given); return getResultSubset(result.response[0], ['id', 'name', 'address']); };

        let assertFn = assert.deepEqual;
        let testCases = [
            {
                given: { id: 1 },
                expected: { id: 1, name: "Splendid Kebabs", address: "42 Bla Avenue, Madrid" },
                testFn: testFn,
                assertFn: assertFn
            },
            {
                given: { id: 5 },
                expected: { id: 5, name: "The Dirty One", address: "10 Banana Place, Madrid" },
                testFn: testFn,
                assertFn: assertFn
            }
        ];

        return await runTestCases(test, testCases);
    },
    'api.getVenue non-existing venue should return expected Object': async (test) => {
        let testFn = api.getVenue;
        let assertFn = assert.deepEqual;
        let testCases = [
            {
                given: { id: 23 },
                expected: {
                    "responseCode": 404,
                    "responseStatus": "Not Found",
                    "response": []
                },
                testFn: testFn,
                assertFn: assertFn
            }
        ];

        return await runTestCases(test, testCases);
    },
    'api.getVenues should return expected Object with expected rows': async (test) => {
        // Using same test and assert fns throughout
        let testFn = api.getVenues;
        let assertFn = assert.deepEqual;
        let testCases = [
            {
                given: { startRow: 1, maxRows: 3 },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": [
                        {
                            "id": 2,
                            "name": "The Kebaberie"
                        },
                        {
                            "id": 3,
                            "name": "Meats Peeps"
                        },
                        {
                            "id": 4,
                            "name": "The Rotisserie"
                        }
                    ]
                },
                testFn: testFn,
                assertFn: assertFn
            },
            {
                given: { startRow: 4 },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": [
                        {
                            "id": 5,
                            "name": "The Dirty One"
                        },
                        {
                            "id": 6,
                            "name": "Bodrum Conundrum"
                        }
                    ]
                },
                testFn: testFn,
                assertFn: assertFn
            },
            {
                given: { maxRows: 4 },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": [
                        {
                            "id": 1,
                            "name": "Splendid Kebabs"
                        },
                        {
                            "id": 2,
                            "name": "The Kebaberie"
                        },
                        {
                            "id": 3,
                            "name": "Meats Peeps"
                        },
                        {
                            "id": 4,
                            "name": "The Rotisserie"
                        }
                    ]
                },
                testFn: testFn,
                assertFn: assertFn
            },
            {
                given: {},
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": [
                        {
                            "id": 1,
                            "name": "Splendid Kebabs"
                        },
                        {
                            "id": 2,
                            "name": "The Kebaberie"
                        },
                        {
                            "id": 3,
                            "name": "Meats Peeps"
                        },
                        {
                            "id": 4,
                            "name": "The Rotisserie"
                        },
                        {
                            "id": 5,
                            "name": "The Dirty One"
                        },
                        {
                            "id": 6,
                            "name": "Bodrum Conundrum"
                        }
                    ]
                },
                testFn: testFn,
                assertFn: assertFn
            },
            {
                given: { startRow: 0, maxRows: 7 },
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": [
                        {
                            "id": 1,
                            "name": "Splendid Kebabs"
                        },
                        {
                            "id": 2,
                            "name": "The Kebaberie"
                        },
                        {
                            "id": 3,
                            "name": "Meats Peeps"
                        },
                        {
                            "id": 4,
                            "name": "The Rotisserie"
                        },
                        {
                            "id": 5,
                            "name": "The Dirty One"
                        },
                        {
                            "id": 6,
                            "name": "Bodrum Conundrum"
                        }
                    ]
                },
                testFn: testFn,
                assertFn: assertFn
            },
            {
                given: 0,
                expected: {
                    "responseCode": 200,
                    "responseStatus": "OK",
                    "response": [
                        {
                            "id": 1,
                            "name": "Splendid Kebabs"
                        },
                        {
                            "id": 2,
                            "name": "The Kebaberie"
                        },
                        {
                            "id": 3,
                            "name": "Meats Peeps"
                        },
                        {
                            "id": 4,
                            "name": "The Rotisserie"
                        },
                        {
                            "id": 5,
                            "name": "The Dirty One"
                        },
                        {
                            "id": 6,
                            "name": "Bodrum Conundrum"
                        }
                    ]
                },
                testFn: testFn,
                assertFn: assertFn
            },
            {
                given: { startRow: 2, maxRows: 0 }, // None are returned
                expected: {
                    "responseCode": 404,
                    "responseStatus": "Not Found",
                    "response": []
                },
                testFn: testFn,
                assertFn: assertFn
            }
        ];

        return await runTestCases(test, testCases);
    }

};


/*
 *  Entry point for admin tests
 */
async function runAdminTests() {
    try {
        return await runTests(adminTestCollection);
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

/*
 * Runs all tests in testCollection, and builds summary with stats 
 */
async function runTests(testCollection = {}) {
    try {
        let summary = [];
        const totalTests = Object.keys(testCollection).length;
        let totalTestsPassed = 0;
        let totalTestsFailed = 0;
        for (let test in testCollection) {
            let result = await testCollection[test](test);
            // result.passed is boolean
            if (result.passed) {
                summary.push({ [test]: 'passed', result: result });
                totalTestsPassed++;
            } else {
                summary.push({ [test]: 'failed', result: result });
                totalTestsFailed++;
            }
        }
        logger.info(JSON.stringify({ summary: summary }));
        logger.info(`Test run complete. ${ConsoleCodes.FgYellow}Test Cases${ConsoleCodes.Reset}: ${totalTests} ${ConsoleCodes.FgGreen}Passed${ConsoleCodes.Reset}: ${totalTestsPassed} ${ConsoleCodes.FgRed}Failed${ConsoleCodes.Reset}: ${totalTestsFailed}`);

        return {
            responseCode: 200,
            response: {
                summary: summary,
                stats: { totalTests: totalTests, totalTestsPassed: totalTestsPassed, totalTestsFailed: totalTestsFailed }
            }
        };

    } catch (err) {
        logger.error(err);
        throw err;
    }
}

/* 
 * Executes an assert fn without throwing all over the shop. 
 */
async function runAssert(assertFn, actual, expected) {
    let assertSucceeded = false;
    try {
        await assertFn(actual, expected, `Expected: ${expected} got: ${actual}`);
        assertSucceeded = true;
    } catch (err) {
        // replace any undefined values with null so JSON.stringify doesn't skip them
        logger.error(JSON.stringify(err, (k, v) => { if (v === undefined) { logger.warn(`undefined was converted to null to preseve output in the following Error message.`); return null; } else return v; }));
    }
    return assertSucceeded;
}

/* 
 *  Runs all test cases passed in against against the specified test function, and
 *  asserts its result against expected output, using the specified assert function.
 *  Returns flag indicating whether all test cases in the test succeeded, together with
 *  stats comprising total assert count for the test and number of those asserts that
 *  succeeded and failed. (Note: A test case can have many asserts.)
 */
async function runTestCases(test, testCases) {
    let failures = false;
    let assertCount = 0;
    let assertSuccessCount = 0;
    let assertFailCount = 0;
    for (let testCase of testCases) {
        let result = await testCase.testFn(testCase.given);
        let assertResult = await runAssert(testCase.assertFn, result, testCase.expected);
        // Update stats
        assertCount++;
        assertResult ? assertSuccessCount++ : assertFailCount++;
        // set failures flag on first failure only
        if (assertResult === false && failures === false) {
            failures = true;
        }
    }
    if (!failures) {
        logger.info(`${ConsoleCodes.FgGreen}Passed${ConsoleCodes.Reset}: '${test}' (Asserts: ${assertCount}, Succeeded: ${assertSuccessCount}, Failed: ${assertFailCount})`);
    } else {
        logger.info(`${ConsoleCodes.FgRed}Failed${ConsoleCodes.Reset}: '${test}' (Asserts: ${assertCount}, Succeeded: ${assertSuccessCount}, Failed: ${assertFailCount})`);
    }

    return {
        passed: !failures, // passed is true if no failures in all test cases, false otherwise
        asserts: { total: assertCount, succeeded: assertSuccessCount, failed: assertFailCount } // assert stats
    };
}

/*
 * Helper. Returns subset of obj where keys match.
 * e.g. if 
 *      obj = { id: 1, name: 'bob', username: 'bob23'}
 * and we call
 *      getResultSubset(obj, ['id', 'name'])
 * we'll get back
 *      { id: 1, name: 'bob' }
 */
function getResultSubset(obj = {}, keys = []) {
    let result;
    if (obj === Object(obj)) {
        result = pick(obj, keys);
    }

    return result;
}


module.exports = { runAdminTests };



