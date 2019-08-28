'use strict';

const { KEBAPI_SERVER_PORT, KEBAPI_SERVER_POST_MAX_SIZE } = require('./config');

const http = require('http');
const port = KEBAPI_SERVER_PORT;
const url = require('url');
const qs = require('querystring');

const hEnv = require('./helper-env');
const logger = require('./logger');
const dal = require('./dal');
const api = require('./api');
const auth = require('./auth');
const { Role } = require('./roles');
const tests = require('./tests');
const cl = require('./command-line');
const CodedError = require('./errors').CodedError;


(async function initialise() {
    logger.info('> initialise');
    try {
        // Attempt to run anything recognised on the command line
        await processCommandLine();
    }
    catch (err) {
        logger.error(err);
    }
    logger.info('< initialise');
})();


http.createServer(async (req, res) => {

    logger.info("> createServer");

    if (hEnv.isDev()) {
        logger.info(`ENV: In dev environment`);
    } else {
        logger.info(`ENV: Not it dev environment`);
    }

    let result = {};
    let postData;
    let act;

    try {

        // Set up receipt of any request POST data
        if (req.method === 'POST') {
            /* TODO: Could increase specificity so this only fires on POST requests where we expect to have post data.
             * (Sometimes all data can be determined from route and none is actually posted, e.g.:
             * POST /users/:userId/favourites/:venueId to add a favourite.)
             */
            try {
                postData = await getPostData(req);
                logger.debug(`Received POST data: ${JSON.stringify(postData)}`);
            } catch (err) {
                logger.error(err);
                result = await api.responseBadRequest(`There was a problem with the post data received in the request.`);
                throw err;
            }
        }

        // Get Action to execute based on request route
        try {
            act = await route(req, postData);
        } catch(err) {
            logger.error(err);
            result = await api.responseInternalServerError(`An error occurred routing the request.`);
            throw err;
        }


        // Ensure DB is available and ready if an Action is going to require it
        // TODO: These checks are probably too sledgehammer here, because they happen for every request. Review.
        try {
            if (![api.responseNotFound].includes(act.action)) {
                // TODO: This block can be filtered further. Idea is to invoke DB initialisations only
                // if DB will be used in generating a response.
                result = await dal.checkDBExists();
                logger.debug(`dal.checkDBExists result: ${JSON.stringify(result)}`);
                if (result !== true) {
                    throw new Error(`DB does not exist.`);
                }

                result = await dal.setTargetDB();
                logger.debug(`dal.setTargetDB result: ${JSON.stringify(result)}`);
                if (result !== true) {
                    throw new Error(`Could not set target DB.`);
                }

                result = await dal.checkTablesExist();
                logger.debug(`dal.checkTablesExist result: ${JSON.stringify(result)}`);
                if (result.allExist !== true) {
                    throw new Error(`DB verification failed.`);
                }
            }
        } catch (err) {
            logger.error(err);
            result = await api.responseInternalServerError(`There is a problem connecting to the database or verifying it. Try again in a bit.`);
            throw err;
        }


        // Evaluate permissions needed to execute Action
        let hasRolePermission = false;
        let hasOwnershipPermission = false;
        if (act.action.minRole === undefined) {
            // Role information has not been set for an Action
            result = await api.responseInternalServerError(`There is a misconfiguration problem on the server. Try again in a bit.`);
            throw new Error(`Role flag has not been set for Action: '${act.action.name}'`);
        }
        if (act.action.minRole === Role.EVERYONE) {
            // Grant all permissions
            hasRolePermission = true;
            hasOwnershipPermission = true;
        } else {
            // Tokens are expected for any Action that isn't available to everyone,
            // i.e. where action.role !== Role.EVERYONE

            // Get token from request
            let token;
            try {
                token = await getTokenFromRequest(req);
            } catch (err) {
                logger.error(err);
                if (err.code && err.code === 'KE140') {
                    result = await api.responseUnauthorised(`Missing an expected token.`);
                } else {
                    result = await api.responseInternalServerError(`Something went wrong accessing an expected token.`);
                }
                throw err;
            }

            // Get id of user from token
            let id;
            try {
                id = await getIdFromToken(token);
            }
            catch (err) {
                logger.error(err);
                if (err.code && err.code === 'KE120') {
                    result = await api.responseUnauthorised(`Invalid token. Expected data missing from payload.`);
                } else if (err.code && err.code === 'KE122') {
                    result = await api.responseUnauthorised(`Invalid token.`);
                } else if (err.code && err.code === 'KE123') {
                    result = await api.responseUnauthorised(`Invalid token. You may need to log in again.`);
                } else {
                    result = await api.responseInternalServerError(`Error retrieving token information.`);
                }
                throw err;
            }

            // Now we have the user's id from the token, check if the user's assigned role has permission to execute the chosen Action
            let rolePermissionResult;
            try {
                rolePermissionResult = await checkRoleGrantsPermissionForAction(id, act);
            } catch (err) {
                logger.error(err);
                if (err.code && err.code === 'KE130') {
                    result = await api.responseInternalServerError(`Error checking role permissions.`); // Keep same generic response, but could handle differently if it becomes necessary  
                } else {
                    result = await api.responseInternalServerError(`Error checking role permissions.`);
                }
                throw err;
            }
            hasRolePermission = rolePermissionResult.hasPermission;

            // Also using the user's id from the token, check user has ownership of the Action if the Action is owned
            if (rolePermissionResult.role.id === Role.ADMIN) {
                // If user's role is admin, always grant permission
                hasOwnershipPermission = true;
            } else {
                // Otherwise, check the ownership
                try {
                    hasOwnershipPermission = await checkOwnershipGrantsPermissionForAction(id, act);
                } catch (err) {
                    logger.error(err);
                    if (err.code && (err.code === 'KE110' || err.code === 'KE111')) {
                        result = await api.responseInternalServerError(`Cannot verify ownership permissions.`);
                    } else {
                        result = await api.responseInternalServerError(`Error checking ownership permissions.`);
                    }
                    throw err;
                }
            }
        }

        // If we have the right permissions, execute the Action
        if (hasRolePermission && hasOwnershipPermission) {
            // Execute the chosen Action
            try {
                if (Array.isArray(act.args)) {
                    result = await act.action(...act.args);
                } else {
                    result = await act.action(act.args);
                }

            } catch (err) {
                logger.error(err);
                result = await api.responseInternalServerError(`An error occurred responding to your request. Please try again later.`);
                throw err;
            }
        } else {
            result = await api.responseForbidden(`You do not have permission to do that.`);
        }

        logger.info(`Result: ${JSON.stringify(result)}`);
        
    } catch (err) {
        logger.error(err);
    }

    // Send the response
    await res.writeHead(result.responseCode, { 'Content-Type': 'application/json' });
    await res.write(JSON.stringify(result));
    await res.end();

    logger.info("< createServer");

}).listen(port);

/**
 * Shoehorn some routing functionality
 * 
 * @param {any} req request
 * @param {any} postData (optional) POST data
 * @returns {object} { action: fn, args: args }
 */
async function route(req, postData = {}) {
    let method = req.method;
    let parsedUrl = url.parse(req.url, true);
    let queryStringParameters = parsedUrl.query;
    let pathSegments = parsedUrl.pathname.split("/").filter(v => v !== "");

    let action = undefined; // action will be a fn to execute
    let args = undefined; // args to give to that fn

    // Attempt to match routes
    try {
        // Only attempt to match these in development environment
        // GET requests
        switch (hEnv.isDev() && method === 'GET' ? pathSegments[0] : undefined) {
            case 'gettoken':
                if (isIdFormat(pathSegments[1])) {
                    let id = pathSegments[1];
                    // GET /gettoken/:id
                    action = api.getToken;
                    args = { id };
                }
                break;
            case 'verifytoken':
                if (pathSegments[1]) {
                    let token = pathSegments[1];
                    // GET /verifytoken/:token
                    action = api.verifyToken;
                    args = { token };
                }
                break;
            case 'gethash':
                if (pathSegments[1]) {
                    let value = pathSegments[1];
                    // GET /gethash/:value
                    action = api.getHash;
                    args = { value };
                }
                break;
            case 'resettestdb':
                // GET /resettestdb
                action = api.resetTestDB;
                args = {};
                break;
            case 'tests':
                if (pathSegments[1] === 'admin') {
                    // GET /tests/admin
                    action = tests.runAdminTests;
                    args = {};
                }
                break;
        }
        // If no match yet, attempt to match with the remainder (non isDev())
        // GET requests
        switch (action === undefined && method === 'GET' ? pathSegments[0] : undefined) {
            case 'venues':
                if (isIdFormat(pathSegments[1])) {
                    // GET /venues/:venueId
                    let id = pathSegments[1];
                    action = api.getVenue;
                    args = { id };
                } else {
                    // GET /venues (optional: ?startRow=n&maxRows=n)
                    action = api.getVenues;
                    args = queryStringParameters;
                }
                break;
            case 'users':
                if (isIdFormat(pathSegments[1])) {
                    let id = pathSegments[1];
                    if (pathSegments[2] === 'favourites') {
                        // GET /users/:id/favourites/
                        action = api.getUserFavourites;
                        args = { id: id };
                    } else if (pathSegments[2] === 'role') {
                        // GET /users/:id/role/
                        action = api.getUserRole;
                        args = { id: id };
                    } else if (pathSegments[2] === 'status') {
                        // GET /users/:id/status/
                        action = api.getUserAccountStatus;
                        args = { id: id };
                    } else {
                        // GET /users/:id/
                        action = api.getUser;
                        args = { id: id };
                    }
                } else {
                    // GET /users (optional: ?startRow=n&maxRows=n)
                    action = api.getUsers;
                    args = queryStringParameters;
                }
                break;
        }
        // POST requests
        switch (action === undefined && method === 'POST' ? pathSegments[0] : undefined) {
            case 'users':
                if (pathSegments[1] === 'login') {
                    // POST /users/login
                    action = api.loginUser;
                    args = postData;
                } else if (pathSegments[1] === 'register') {
                    // POST /users/register
                    action = api.registerUser;
                    args = postData;
                } else if (isIdFormat(pathSegments[1])) {
                    let id = pathSegments[1];
                    if (pathSegments[2] === 'favourites') {
                        if (isIdFormat(pathSegments[3])) {
                            let venueId = pathSegments[3];
                            // POST /users/:userId/favourites/:venueId
                            action = api.addUserFavourite;
                            args = { id, venueId };
                        }
                    } else {
                        // POST /users/:userId
                        // This "un-deletes" a user. In reality we're implementing a status toggle, which simplifies account recovery, etc.
                        // TODO: Arguably this should be a PUT. For simplicity, keeping it as POST for now. Review if more PUTs are added.
                        action = api.activateUser;
                        args = { id };
                    }
                }
                break;
        }
        // DELETE requests
        switch (action === undefined && method === 'DELETE' ? pathSegments[0] : undefined) {
            case 'users':
                if (isIdFormat(pathSegments[1])) {
                    let id = pathSegments[1];
                    if (pathSegments[2] === 'favourites') {
                        if (isIdFormat(pathSegments[3])) {
                            let venueId = pathSegments[3];
                            // DELETE /users/:userId/favourites/:venueId
                            action = api.removeUserFavourite;
                            args = { id, venueId };
                        }
                    } else {
                        // DELETE /users/:userId
                        // This "deletes" a user. In reality we're implementing a status toggle, which simplifies account recovery, etc.
                        action = api.deactivateUser; 
                        args = { id };
                    }
                }
                break;
        }

        // If no route could be mapped, default to a not found Action
        if (action === undefined) {
            action = api.responseNotFound;
            args = undefined;
        }

    } catch (err) {
        logger.error(err);
        throw err;
    }

    return {
        action: action,
        args: args
    };
}

/*
  Collects any POST data. Currently supports:
    . application/json
    . application/x-www-form-urlencoded
 */
async function getPostData(req) {
    const APP_JSON = 'application/json';
    const APP_FORM_URLENCODED = 'application/x-www-form-urlencoded';
    let data = '';
    return new Promise((resolve, reject) => {
        // Reject if we're not receiving one of the accepted content-types
        if (![APP_FORM_URLENCODED, APP_JSON].includes(req.headers['content-type'])) {
            reject(`POST data content-type must be '${APP_FORM_URLENCODED}' or '${APP_JSON}', instead received '${req.headers['content-type']}'`);
        }
        // Receive data chunks
        req.on('data', (dataChunk) => {
            // Append chunk to data received so far
            data += dataChunk.toString();
            // Stop receiving if we're being sent too much data because it could crash the server/be used as exploit.
            if (data.length > KEBAPI_SERVER_POST_MAX_SIZE) {
                reject(`POST data size limit exceeded. Too much data sent.`);
            }
        });
        req.on('end', (contentType = req.headers['content-type']) => {
            // NOTE: parsedData will be undefined, and intended to be so, if data wasn't received from one of the accepted
            // content-types. i.e. if we're not expecting the content type, we'll resolve as if no data was received.
            // Unknown if it's possible to 'end' a request with a different content-type to how it began, but this should
            // guard against that, in addition to choosing the type of parsing required.
            let parsedData = undefined; 
            if (contentType === APP_FORM_URLENCODED) {
                // Parse as Form data
                parsedData = qs.parse(data);
            } else if (contentType === APP_JSON) {
                // Parse as JSON data
                parsedData = JSON.parse(data);
            }
            resolve(parsedData);
        });
        
    });
}
async function getTokenFromRequest(req) {
    try {
        let requestToken = req.headers['x-access-token'];
        if (!requestToken) {
            throw new CodedError('KE140', `Token missing from header.`);
        }
        return requestToken;
    } catch (err) {
        logger.error(err);
        throw err;
    }
}
async function getIdFromToken(token) {
    try {
        let verifyResult = await auth.verifyToken(token);
        if (verifyResult.verified === true) {
            let id = verifyResult.payload.id;
            if (!isIdFormat(id)) {
                throw new CodedError('KE120', `Invalid token. Id missing from payload.`);
            }
            return id;
        } else {
            let code = undefined;
            switch (verifyResult.rejectErrorType) {
                case 'JsonWebTokenError':
                    code = 'KE122';
                    break;
                case 'TokenExpiredError':
                    code = 'KE123';
                    break;
            }
            if (code) {
                throw new CodedError(code, `Invalid token. Reject reason: '${verifyResult.rejectReason}'.`);
            } else {
                throw new Error(`Invalid token. Reject reason: '${verifyResult.rejectReason}'.`);
            }
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

async function checkRoleGrantsPermissionForAction(id, act) {
    // Here we're checking if the user's role is appropriate to the Action being requested
    try {
        let hasPermission = false;
        let roleResult = await dal.getUserRole(id);
        if (roleResult.length === 0) {
            throw new CodedError('KE130', `Attempt to retrieve user role for id '${id}' returned no role.`);
        }
        let role = roleResult[0];
        // If role is either admin or above the Action's minimum role, we have role permission
        // NOTE: Assumes a descending order in role precedence, with next-highest having permission.
        // It's a simplistic model, but adequate for current stage of project.
        if (role.id === Role.ADMIN || role.id <= act.action.minRole) {
            hasPermission = true;
        }

        return {
            hasPermission,
            ...role ? { role: role } : {}
        };
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

async function checkOwnershipGrantsPermissionForAction(id, act) {
    try {
        let hasPermission = false;
        if (act.action.hasOwner === undefined || act.action.hasOwner !== true && act.action.hasOwner !== false) {
            // Every Action should have ownership defined, and it must be set to either true or false
            throw new CodedError('KE110', `Cannot verify owner. Action does not have an owner flag properly set.`);
        }
        if (act.action.hasOwner === false) {
            // If there's no owner, we're going to default to Actions having permission granted
            hasPermission = true;
        } else if (act.action.hasOwner === true) {
            // The Action has an owner, so we need to check the id passed into this function matches
            // the id being operated on by the Action. 
            // In this implementation we're going to grab that second id directly from the args of 
            // the Action. This'll likely need to change in a fuller implementation.
            if (!(act.args.hasOwnProperty && act.args.hasOwnProperty('id'))) {
                throw new CodedError('KE111', `Cannot verify owner. Action is flagged as having an owner, but act.args does not contain the expected id.`);
            }
            // NOTE: args.id can arrive as a string from post data. parseInt won't be suitable 
            // if ids change from INTs to UUIDs
            let ownerId = parseInt(act.args.id, 10);
            if (id === ownerId) {
                // Ids match. Grant permission.
                hasPermission = true;
            }
        }
        return hasPermission;
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

/**
 * Allows us to perform Actions of the api module from the command line.
 * Examples:
 *  server.js -act resetTestDB
 *  server.js -act getToken {"""id""":1} // Escaping quotes is necessary, as shown. No spaces in arguments.
 * Results are logged. 
 * */
async function processCommandLine() {
    try {
        let clArgs = cl.parseArgv(process.argv.slice(2));
        if (clArgs.length > 0) {
            logger.info(`Command line args received: ${JSON.stringify(clArgs)}`);
            logger.info(`Executing any recognised commands...`);
            for (let item of clArgs) {
                if (item.command === 'act') {
                    // Actions, e.g. -act resetTestDB or -act getToken {"""id""":1}
                    let action = item.commandArgs[0] || undefined;
                    let args = item.commandArgs[1] || undefined;
                    logger.info(`Executing Action: ${action} with args: ${args}`);
                    if (args) {
                        args = JSON.parse(args); // api currently takes objects as args throughout, JSON.parse coverts the received command line string into an object
                    }
                    let result = await api[action](args); // Currently assumes api module. Likely sufficient for this implementation
                    logger.info(`Action completed. Result: ${JSON.stringify(result)}`);
                }
            }
            logger.info(`Completed executing recognised commands.`);
        }

    } catch (err) {
        logger.error(err);
        throw err;
    }
}



/**
 * Checks value is in the format of a valid id. Only format is checked, so a valid id may not exist.
 * Ids are currently integers, func will need to be updated if we switch to UUID or other.
 * 
 * @param {any} value value to be checked
 * @returns {boolean} true if value is an id, false otherwise
 */
function isIdFormat(value) {
    try {
        let is = false;
        if (typeof value === "number") {
            is = true;
        } else if (typeof value === "string") {
            // This regex checks we have an int
            if (value.match(/^[0-9]*$/gm)) {
                is = true;
            }
        }
        return is;
    } catch (err) {
        logger.error(err);
        throw err;
    }    
}
