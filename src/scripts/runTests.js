/**
 * Script to run tests. 
 * 
 * (This Action can also be run from the server. This is an alternative.)
 * */

const tests = require('../../tests');

(async () => {
    let result;
    result = await tests.runAdminTests();
    console.log(`Done. Result: ${JSON.stringify(result)}`);
})();
