/**
 * Provides various asychronous Promise-based security and authorisation functions primarily related
 * to hashing and token handling
 * 
 * */

'use strict';

const util = require('util');

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const logger = require('./logger');

const {
    KEBAPI_AUTH_SECRET,
    KEBAPI_AUTH_TOKEN_EXPIRY_MS // Expiry time in miliseconds
} = require('./config');

jwt.sign = util.promisify(jwt.sign);
jwt.verify = util.promisify(jwt.verify);

(() => {

    async function getHash(value) {
        // TODO: salt
        try {
            let hashedValue = await bcrypt.hash(value, 8);
            return hashedValue;
        } catch (err) {
            logger.error(err);
            throw err;
        }
    }
    async function comparePlainTextToHash(text, hash) {
        try {
            let match = await bcrypt.compare(text, hash);
            return match;
        }
        catch (err) {
            logger.error(err);
            throw err;
        }
    }
    async function getToken(id) {
        try {
            let token = await jwt.sign({ id: id }, KEBAPI_AUTH_SECRET, { expiresIn: KEBAPI_AUTH_TOKEN_EXPIRY_MS });
            return token;
        }
        catch (err) {
            logger.error(err);
            throw err;
        }
    }
    async function verifyToken(token) {
        let verified = false;
        let payload;
        let rejectReason;
        let rejectErrorType;
        try {
            payload = await jwt.verify(token, KEBAPI_AUTH_SECRET);
            verified = true;
        } catch (err) {
            // Seems there's no distinction between jwt.verify failing due to an internal error and 
            // the actual verification being invalid, so filter on strings :/
            logger.error(err);
            if (!['JsonWebTokenError', 'TokenExpiredError'].includes(err.name)) {
                // Throw if it's not an expected state
                throw err;
            }
            rejectReason = err.message;
            rejectErrorType = err.name;
        }
        return {
            verified,
            ...payload ? { payload: payload } : {},
            ...rejectReason ? { rejectReason: rejectReason } : {},
            ...rejectErrorType ? { rejectErrorType: rejectErrorType } : {}
        };
    }
    module.exports = {
        getHash, comparePlainTextToHash,
        getToken, verifyToken
    };

})();
