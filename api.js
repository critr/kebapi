/**
 * Asynchronous REST API
 * 
 * */

'use strict';

const dal = require('./dal');
const logger = require('./logger');
const auth = require('./auth');
const { Role } = require('./roles');

const responseCodes = {
    OK: 200,
    BadRequest: 400,
    Unauthorised: 401, // We'll use this for failures in user authentication, e.g. username and password failures when logging in
    Forbidden: 403, // We'll use this for failures related to permissions, e.g. one user trying to get the details of a different user, or trying to perform the actions of an admin
    NotFound: 404,
    PayloadTooLarge: 413,
    InternalServerError: 500
};

(function initialise() {
    logger.info('> initialise');

    // Set permissions for actions. Any action called by the server will need these.
    try {
        let permissions = [

            // role admin
            { action: deactivateUser, minRole: Role.ADMIN, hasOwner: true }, // TODO: This is a user "delete" operation. Likely shouldn't be an admin option in future.
            { action: activateUser, minRole: Role.ADMIN, hasOwner: true }, // TODO: This is a user "un-delete" operation. Likely shouldn't be an admin option in future.
            { action: getUserAccountStatus, minRole: Role.ADMIN, hasOwner: true },
            { action: getUserRole, minRole: Role.ADMIN, hasOwner: true },
            { action: resetTestDB, minRole: Role.ADMIN, hasOwner: false },
            { action: getHash, minRole: Role.ADMIN, hasOwner: false },
            { action: getToken, minRole: Role.ADMIN, hasOwner: false },
            { action: verifyToken, minRole: Role.ADMIN, hasOwner: false },
            { action: getUsers, minRole: Role.ADMIN, hasOwner: false },

            // role user (user can access if ids match, otherwise only admin can)
            { action: getUser, minRole: Role.USER, hasOwner: true },
            { action: getUserFavourites, minRole: Role.USER, hasOwner: true },
            { action: addUserFavourite, minRole: Role.USER, hasOwner: true },
            { action: removeUserFavourite, minRole: Role.USER, hasOwner: true },

            // role everyone
            { action: getVenue, minRole: Role.EVERYONE, hasOwner: false },
            { action: getVenues, minRole: Role.EVERYONE, hasOwner: false },
            { action: loginUser, minRole: Role.EVERYONE, hasOwner: false },
            { action: registerUser, minRole: Role.EVERYONE, hasOwner: false },
            { action: responseBadRequest, minRole: Role.EVERYONE, hasOwner: false },
            { action: responseForbidden, minRole: Role.EVERYONE, hasOwner: false },
            { action: responseNotFound, minRole: Role.EVERYONE, hasOwner: false },
            { action: responsePayloadTooLarge, minRole: Role.EVERYONE, hasOwner: false },
            { action: responseInternalServerError, minRole: Role.EVERYONE, hasOwner: false }

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


async function getVenue({ id } = {}) {
    let responseCode = responseCodes.InternalServerError;
    let result;
    try {
        result = await dal.getVenue(id);
        if (result.length === 0) {
            responseCode = responseCodes.NotFound;
        } else {
            responseCode = responseCodes.OK;
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return formatResult(responseCode, result);
}
async function getVenues({ startRow, maxRows } = {}) {
    let responseCode = responseCodes.InternalServerError;
    let result;
    try {
        result = await dal.getVenues(startRow, maxRows);
        if (result.length === 0) {
            responseCode = responseCodes.NotFound;
        } else {
            responseCode = responseCodes.OK;
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return formatResult(responseCode, result);
}

async function loginUser({ username, email, password } = {}) {
    let responseCode = responseCodes.InternalServerError;
    let user;
    let result;
    try {
        if (!username && !email || !password) {
            responseCode = responseCodes.BadRequest;
        }
        else {            
            if (username) {
                result = await dal.getUserByUserName(username);
            } else if (email) {
                result = await dal.getUserByEmail(email);
            }
            if (!result || result.length === 0) {
                responseCode = responseCodes.NotFound;
                result = "Can't find that user";
            } else {
                user = result[0];
                let match = await auth.comparePlainTextToHash(password, user.password_hash);
                if (!match) {
                    responseCode = responseCodes.Unauthorised;
                    result = "Those user credentials weren't right";
                } else {
                    let token = await auth.getToken(user.id);
                    responseCode = responseCodes.OK;
                    result = token;
                }
            }
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return formatResult(responseCode, result);
}
async function registerUser({ username, name, surname, email, password } = {}) {
    let responseCode = responseCodes.InternalServerError;
    let result;
    try {
        // TODO: parsing and validation of incoming data to check strings are strings, emails are emails, etc.
        if (!(username || name || surname || email || password)) {
            responseCode = responseCodes.BadRequest;
            result = { result: undefined, msg: `Missing required data.` };
        } else {
            // check user exists by username
            let usernameResult = await dal.getUserByUserName(username);
            if (usernameResult && usernameResult.length > 0) {
                responseCode = responseCodes.BadRequest;
                result = { result: undefined, msg: `Username already registered.` };
            } else {
                // check user exists by email
                let emailResult = await dal.getUserByEmail(email);
                if (emailResult && emailResult.length > 0) {
                    responseCode = responseCodes.BadRequest;
                    result = { result: undefined, msg: `Email already registered.` };
                } else {
                    // username and email do not already exist, user can be registered.
                    // We'll only store a hashed password
                    let passwordHash = await auth.getHash(password);
                    // dal.addUser returns insert id of new row, or 0 if row existed, or undefined if insert failed.
                    // Strictly speaking a result >= 0 is fine since it means either a new user was added or an
                    // existing user was unchanged. In practice, we should never get 0 due to the duplicate
                    // user checks executed further up.
                    let addResult = await dal.addUser(username, name, surname, email, passwordHash, Role.USER);
                    if (addResult > 0) {
                        responseCode = responseCodes.OK;
                        result = { result: addResult, msg: `User registered.` };
                    } else if (addResult === 0) {
                        responseCode = responseCodes.OK;
                        result = { result: addResult, msg: `User already registered.` };
                    } else {
                        result = { result: addResult, msg: `Something went wrong registering the user. Please try again later.` };
                    }
                }
            }
        }

    } catch (err) {
        logger.error(err);
        throw err;
    }
    return formatResult(responseCode, result);
}
async function getUser({ id } = {}) {
    let responseCode = responseCodes.InternalServerError;
    let result;
    try {
        result = await dal.getUser(id);
        if (result.length === 0) {
            responseCode = responseCodes.NotFound;
        } else {
            responseCode = responseCodes.OK;
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return formatResult(responseCode, result);
}
async function activateUser({ id } = {}) {
    let responseCode = responseCodes.InternalServerError;
    let result;
    try {
        result = await dal.activateUser(id);
        if (result) {
            responseCode = responseCodes.OK;
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return formatResult(responseCode, result);
}
async function deactivateUser({ id } = {}) {
    let responseCode = responseCodes.InternalServerError;
    let result;
    try {
        result = await dal.deactivateUser(id);
        if (result) {
            responseCode = responseCodes.OK;
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return formatResult(responseCode, result);
}
async function getUsers({ startRow, maxRows } = {}) {
    let responseCode = responseCodes.InternalServerError;
    let result;
    try {
        result = await dal.getUsers(startRow, maxRows);
        //TODO: Should this return NotFound if there are no users?
//        if (result.length === 0) {
//            responseCode = responseCodes.NotFound;
//        } else {
            responseCode = responseCodes.OK;
//        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return formatResult(responseCode, result);
}
async function getUserRole({ id } = {}) {
    let responseCode = responseCodes.InternalServerError;
    let result;
    try {
        result = await dal.getUserRole(id);
        if (result.length === 0) {
            responseCode = responseCodes.NotFound;
        } else {
            responseCode = responseCodes.OK;
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return formatResult(responseCode, result);
}
async function getUserAccountStatus({ id } = {}) {
    let responseCode = responseCodes.InternalServerError;
    let result;
    try {
        result = await dal.getUserAccountStatus(id);
        if (result.length === 0) {
            responseCode = responseCodes.NotFound;
        } else {
            responseCode = responseCodes.OK;
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return formatResult(responseCode, result);
}
async function getUserFavourites({ id, startRow, maxRows } = {}) {
let responseCode = responseCodes.InternalServerError;
    let result;
    try {
        result = await dal.getUserFavourites(id, startRow, maxRows);
        if (result.length === 0) {
            responseCode = responseCodes.NotFound;
        } else {
            responseCode = responseCodes.OK;
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return formatResult(responseCode, result);
}
async function addUserFavourite({ id, venueId } = {}) {
    let responseCode = responseCodes.InternalServerError;
    let result;
    try {
        // dal.addUserFavourite returns insert id of new row, or 0 if row existed, or undefined if insert failed
        result = await dal.addUserFavourite(id, venueId);
        if (result >= 0) {
            responseCode = responseCodes.OK;
        } else {
            responseCode = responseCodes.BadRequest;
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return formatResult(responseCode, result);
}
async function removeUserFavourite({ id, venueId } = {}) {
    let responseCode = responseCodes.InternalServerError;
    let result;
    try {
        result = await dal.removeUserFavourite(id, venueId);
        if (result) {
            responseCode = responseCodes.OK;
        } else {
            responseCode = responseCodes.BadRequest;
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return formatResult(responseCode, result);
}


async function resetTestDB() {
    let responseCode = responseCodes.InternalServerError;
    let result;
    try {
        result = await dal.resetTestDB();
        if (result) {
            responseCode = responseCodes.OK;
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return formatResult(responseCode, result);
}

async function getHash({ value } = {}) {
    let responseCode = responseCodes.InternalServerError;
    let result;
    try {
        result = await auth.getHash(value);
        if (result) {
            responseCode = responseCodes.OK;
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return formatResult(responseCode, result);
}
async function getToken({ id } = {}) {
    let responseCode = responseCodes.InternalServerError;
    let result;
    try {
        result = await auth.getToken(id);
        if (result) {
            responseCode = responseCodes.OK;
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return formatResult(responseCode, result);
}
async function verifyToken({ token } = {}) {
    let responseCode = responseCodes.InternalServerError;
    let result;
    try {
        result = await auth.verifyToken(token);
        if (result) {
            responseCode = responseCodes.OK;
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return formatResult(responseCode, result);
}


/**
 * Helper to consistently format response results
 * @returns {object} A formatted result that includes response code status and result
 * @param {any} responseCode Server response code (e.g. 200, 404, etc.)
 * @param {any} result Any data that is the result of executing a request
 */
function formatResult(responseCode, result) {
    let responseStatus;
    switch (responseCode) {
        case responseCodes.OK:
            responseStatus = "OK"; break;
        case responseCodes.BadRequest:
            responseStatus = "Bad Request"; break;
        case responseCodes.Unauthorised:
            responseStatus = "Unauthorised"; break;
        case responseCodes.Forbidden:
            responseStatus = "Forbidden"; break;
        case responseCodes.NotFound:
            responseStatus = "Not Found"; break;
        case responseCodes.PayloadTooLarge:
            responseStatus = "Payload Too Large"; break;
        case responseCodes.InternalServerError:
            responseStatus = "Internal Server Error"; break;
        default:
            responseStatus = "Unknown";
    }
    return {
        responseCode: responseCode,
        responseStatus: responseStatus,
        response: result
    };
}


// Some response helpers
async function responseBadRequest(msg = {}) {
    return formatResult(responseCodes.BadRequest, msg);
}
async function responseUnauthorised(msg = {}) {
    return formatResult(responseCodes.Unauthorised, msg);
}
async function responseForbidden(msg = {}) {
    return formatResult(responseCodes.Forbidden, msg);
}
async function responseNotFound(msg = {}) {
    return formatResult(responseCodes.NotFound, msg);
}
async function responsePayloadTooLarge(msg = {}) {
    return formatResult(responseCodes.PayloadTooLarge, msg);
}
async function responseInternalServerError(msg = {}) {
    return formatResult(responseCodes.InternalServerError, msg);
}


module.exports = {
    responseBadRequest, responseUnauthorised, responseForbidden, responseNotFound, responsePayloadTooLarge, responseInternalServerError,
    getVenue, getVenues,
    registerUser, activateUser, deactivateUser, getUser, getUsers, loginUser,
    getUserRole,
    getUserAccountStatus,
    getUserFavourites, addUserFavourite, removeUserFavourite,
    resetTestDB, getHash, getToken, verifyToken
};
