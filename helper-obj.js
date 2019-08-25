/*
 * Helper for common object operations
 */

'use strict';

/**
 * Check if an object is empty
 * @param {any} object object to check
 * @returns {boolean} true if object is {}, false otherwise
 */
function isEmpty(object) {
    if (Object.getOwnPropertyNames(object).length === 0)
        return true;
    else
        return false;
}

/**
 * Get the subset of an object by telling it the keys you want to have in the 
 * resulting object
 * @returns {object} Subset
 * @param {any} obj Object to operate on
 * @param {any} keys Keys of the obj members that will be returned in Subset
 */
function pick(obj, keys) {

    return keys.reduce(function (newobj, k) {
        newobj[k] = obj[k];
        return newobj;
    }, {});
}

module.exports = { isEmpty, pick };