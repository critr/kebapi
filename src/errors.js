/**
 * Makes available a custom error that can be given an error code in addition to an error message
 * 
 * */

'use strict';

var util = require('util');

function CodedError(code, message) {
    Error.captureStackTrace(this, CodedError);
    this.name = CodedError.name;
    this.code = code;
    this.message = message;
}

util.inherits(CodedError, Error);

module.exports = { CodedError };