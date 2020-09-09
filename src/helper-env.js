/*
 * Helper for environment variables
 */

'use strict';

// Config will return the NODE_ENV Environment variable if it's set, or default to 'development'
const { NODE_ENV } = require('./config');

function isDev() {
    return NODE_ENV === 'development';
}

module.exports = { isDev };