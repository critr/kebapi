/**
 * NOTE: The server can now read the command line and execute Actions, so invoking this script
 * directly from a command line is no longer necessary. So for example running: 
 * 
 * server.js -act resetTestDB
 * 
 * is the same as using this script. Keeping this here as an alternative method.
 * */

/* 
 * Script to reset test database. 
 * 
 * (This Action can also be run from the server. This is an alternative.)
 * 
 * Intended to be run in situations where the server may not be able to
 * restore the db by itself due to for example, loss of role/permission 
 * tables/data from the database which would prevent the server from getting
 * permission to perform those (or indeed, any) actions.
 * */

const api = require('../api');


(async () => {
    let result;
    result = await api.resetTestDB();
    console.log(`Done. Result: ${JSON.stringify(result)}`);
})();
