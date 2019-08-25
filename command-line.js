'use strict';

/**
 * Provides some basic command line parsing. Works in this way: 
 * 
 * If the command line arguments are: 
 * -act resettestdb {id:1} -h -v 2 bananas -apple -go 100
 * 
 * Then a JSON stringified return result will be: 
 * [{"command":"act","commandArgs":["resettestdb","{id:1}"]},
 *  {"command":"h","commandArgs":[]},
 *  {"command":"v","commandArgs":["2","bananas"]},
 *  {"command":"apple","commandArgs":[]},
 *  {"command":"go","commandArgs":["100"]}]
 * 
 * @param {any} argv The command line arguments, e.g. the result of process.argv.slice(2)
 * @returns {Array} Array of formatted commands and associated arguments
 */
function parseArgv(argv) {
    const SWITCH_PREFIX = '-';
    let arr = Array.from(argv); 
    let result = [];
    let command = '';
    let commandArgs = [];
    for (let idx in arr) {
        if (arr[idx].charAt(0) === SWITCH_PREFIX) {
            if (command !== '') {
                pushCommand();
            }
            command = arr[idx].substring(1);
        } else {
            commandArgs.push(arr[idx]);
        }
    }
    if (command !== '') {
        pushCommand();
    }

    function pushCommand() {
        result.push({ command: command, commandArgs: commandArgs });
        command = '';
        commandArgs = [];
    }

    return result;
}

module.exports = { parseArgv };