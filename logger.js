/**
 * Some quick, home brew logging that wraps console output so it provides neatly formatted log messages
 * with coloured output, timestamps and calling module name. 
 *  
 * Sample output:
 * 
 * [2019-08-03T18:32:35.665Z] [dal] Connection id 26 acquired
 * [2019-08-03T18:32:35.669Z] [dal] Connection id 26 released
 * [2019-08-03T18:32:35.671Z] [server] DEBUG: dal.checkTablesExist result: {"allExist":true,"notFound":[]}
 * [2019-08-03T18:32:35.676Z] [auth] **ERROR**: TokenExpiredError: jwt expired
 * [2019-08-03T18:32:35.679Z] [server] **ERROR**: CodedError: Invalid token. Reject reason: 'jwt expired'.
 * 
 */

'use strict';

const path = require('path');

// Expose ANSI Escape Sequences that can be used to format console output.
// Open any character sequence with these, always ending with Reset.
const ConsoleCodes = {
    // Cancels any previous code
    Reset: "\x1b[0m",
    // Effects
    Bright: "\x1b[1m",
    Dim: "\x1b[2m",
    Underscore: "\x1b[4m",
    Blink: "\x1b[5m",
    Reverse: "\x1b[7m",
    Hidden: "\x1b[8m",
    // Foreground colours
    FgBlack: "\x1b[30m",
    FgRed: "\x1b[31m",
    FgGreen: "\x1b[32m",
    FgYellow: "\x1b[33m",
    FgBlue: "\x1b[34m",
    FgMagenta: "\x1b[35m",
    FgCyan: "\x1b[36m",
    FgWhite: "\x1b[37m",
    // Background colours
    BgBlack: "\x1b[40m",
    BgRed: "\x1b[41m",
    BgGreen: "\x1b[42m",
    BgYellow: "\x1b[43m",
    BgBlue: "\x1b[44m",
    BgMagenta: "\x1b[45m",
    BgCyan: "\x1b[46m",
    BgWhite: "\x1b[47m"
};

function error(msg, ...optionalParameters) {
    console.error(`${fmtTimestamp()} ${fmtModule()} ${fmtErrPrefix()}: ${msg.toString()}`, ...optionalParameters);
}

function info(msg, ...optionalParameters) {
    // No prefix, just message
    console.info(`${fmtTimestamp()} ${fmtModule()} ${msg.toString()}`, ...optionalParameters);
}

function warn(msg, ...optionalParameters) {
    console.warn(`${fmtTimestamp()} ${fmtModule()} ${fmtWarnPrefix()}: ${msg.toString()}`, ...optionalParameters);
}

function debug(msg, ...optionalParameters) {
    console.debug(`${fmtTimestamp()} ${fmtModule()} ${fmtDebugPrefix()}: ${msg.toString()}`, ...optionalParameters);
}


/*
 * Some formatting helpers 
 */

function fmtTimestamp() {
    return `${ConsoleCodes.Dim}${ConsoleCodes.FgCyan}[${new Date().toISOString()}]${ConsoleCodes.Reset}`;
}
function fmtModule() {
    return `${ConsoleCodes.FgYellow}[${callerModuleName()}]${ConsoleCodes.Reset}`;
}
function fmtErrPrefix() {
    // Note: Spaces around message are there to give pill effect when a background colour is set
    return `${ConsoleCodes.FgWhite}${ConsoleCodes.BgRed} **ERROR** ${ConsoleCodes.Reset}`;
}
function fmtDebugPrefix() {
    return `${ConsoleCodes.FgYellow}DEBUG${ConsoleCodes.Reset}`;
}
function fmtWarnPrefix() {
    return `${ConsoleCodes.FgMagenta}WARNING${ConsoleCodes.Reset}`;
}


/*
 * Other helpers
 */

/**
 * Gets name of calling module
 * @returns {string} name of calling module
 * */
function callerModuleName() {
/* TODO: This code is based on the commented out code below it. It relies on string manipulation of the stack
 * trace so it's not great. One big weakness is that the location of the calling module name changes with 
 * nesting of functions. stackLevel represents where the calling module name can currently be found. As long as
 * we don't change how deeply-nested this fn is called within this module, it will work as expected. If it needs
 * to be called deeper or shallower in the future, stackLevel will need to be updated.
 * Find better solution.*/
    const stackLevel = 4; // See note above
    let e = new Error();
    let pathName = e.stack.split('(')[stackLevel].split(')')[0].split(':')[1];
    let fileName = path.basename(pathName, path.extname(pathName));

    return fileName;

    // A Stackoverflow solution:
    //try {
    //    throw new Error();
    //}
    //catch (e) {
    //    try {
    //        let pathName = e.stack.split('(')[3].split(')')[0].split(':')[1];
    //        //let fileName = path.extname(pathName);
    //        let fileName = path.basename(pathName, path.extname(pathName));
    //        return fileName; //e.stack.split('at ')[3].split(' ')[0];
    //    } catch (e) {
    //        return undefined;
    //    }
    //}

}

module.exports = {
    ConsoleCodes,
    error, info, warn, debug
};

