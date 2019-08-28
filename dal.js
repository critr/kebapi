/**
 * An asynchronous Promise-based Data Access Layer built around a MySQL database with connection pooling.
 * 
 * */

// MySQL NOTE: Due to changed security, MySQL80 will require executing something
// like this for the user we will use to connect to the database:
//
// ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '[password-for-root]'
// or
// ALTER USER 'admin'@'%' IDENTIFIED WITH mysql_native_password BY '[password-for-admin]'

'use strict';

const mysql = require('mysql');
const util = require('util');

const { Role } = require('./roles');
const logger = require('./logger');

// Configurable constants. Pulled from config file.
const {
    KEBAPI_DB_NAME,
    KEBAPI_DB_DEFAULT_SELECT_MAX_ROWS, // Upper limit of rows that can be returned in SELECT queries, regardless of any specified maxRows
    KEBAPI_DB_POOL_CONNECTION_LIMIT, // Size of connection pool
    KEBAPI_DB_HOST,
    KEBAPI_DB_USER,
    KEBAPI_DB_PASSWORD,
    KEBAPI_DB_CHARSET,
    KEBAPI_DB_TIMEZONE
} = require('./config');


// Database table names.
// enum
const DbTable = Object.freeze({
    VENUES: 'venues',
    USERS: 'users',
    USER_FAVOURITE_VENUES: 'user_favourite_venues',
    LOOKUP_ROLES: 'lookup_roles',
    LOOKUP_USER_ACCOUNT_STATUS: 'lookup_user_account_status'
});

// Collection (Array) of all database tables we are using. (Used by checkTablesExist() for instance.)
const DB_TABLES = Object.values(DbTable); // Just generated from the enum

// Used MySQL database error constants and codes
// enum
const DbErr = Object.freeze({
    ER_DUP_ENTRY: 1062 // Duplicate entry. Raised on insert of existing record.
});


// User account status. At present using it to flag a 'deleted' or 'undeleted' account,
// but can have any number of statuses.
// enum
const UserAccountStatus = Object.freeze({
    ACTIVE: 1,
    INACTIVE: 0
});


/* - - - - - Connection pool - - - - - */

let pool; // Going with a global for use in this module. Requires calling initialisePool to thoroughly mutate it into something useful.


(function initialise() {
    logger.info('> initialise');
    try {
        // Set up the pool
        pool = initialisePool(pool);

    } catch (err) {
        logger.error(err);
        //Don't throw unless this fn is wrapped in the future because it won't be caught by anything and stop the server.
    }
    logger.info('< initialise');
})();

function initialisePool(connectionPool) {
    try {
        connectionPool = mysql.createPool({
            connectionLimit: KEBAPI_DB_POOL_CONNECTION_LIMIT,
            host: KEBAPI_DB_HOST,
            user: KEBAPI_DB_USER,
            password: KEBAPI_DB_PASSWORD,
            charset: KEBAPI_DB_CHARSET, //'utf8mb4', //'utf8_general_ci',
            timezone: KEBAPI_DB_TIMEZONE
        });

        // Promisify pool
        connectionPool.query = util.promisify(connectionPool.query).bind(connectionPool); // binds 'this' to pool

        // Some connection event logging
        connectionPool.on('acquire', (connection) => {
            logger.info(`Connection id ${connection.threadId} acquired`);
        });
        connectionPool.on('connection', (connection) => {
            logger.info(`Connection id ${connection.threadId} connected`);
        });
        connectionPool.on('enqueue', () => {
            logger.info(`Waiting for available connection slot`);
        });
        connectionPool.on('release', (connection) => {
            logger.info(`Connection id ${connection.threadId} released`);
        });

    } catch (err) {
        logger.error(err);
        throw err;
    }

    return connectionPool;
}

/* - - - - - Database utility and maintenance - - - - - */

async function dropDatabase() {
    let dropped = false;
    try {
        const result = await pool.query(`DROP DATABASE IF EXISTS ??;`, [KEBAPI_DB_NAME]);
        dropped = true;
    } catch (err) {
        logger.error(err);
        throw err;
    }

    return dropped;
}
async function createDatabase() {
    let created = false;
    try {
        const result = await pool.query(`CREATE DATABASE ??;`, [KEBAPI_DB_NAME]);
        created = true;
    } catch (err) {
        logger.error(err);
        throw err;
    }

    return created;
}
async function createTables() {
    let created = false;
    try {
        let result;
        result = await pool.query(`CREATE TABLE ?? (id INT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (id), name VARCHAR(255), geo_lat DECIMAL(8,6), geo_lng DECIMAL(9,6), address VARCHAR(255), rating TINYINT);`, [DbTable.VENUES]);
        result = await pool.query(`CREATE TABLE ?? (id TINYINT UNSIGNED NOT NULL, PRIMARY KEY (id), role VARCHAR(20) NOT NULL UNIQUE);`, [DbTable.LOOKUP_ROLES]);
        result = await pool.query(`CREATE TABLE ?? (id TINYINT UNSIGNED NOT NULL, PRIMARY KEY (id), status VARCHAR(20) NOT NULL UNIQUE);`, [DbTable.LOOKUP_USER_ACCOUNT_STATUS]);
        result = await pool.query(`CREATE TABLE ?? (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (id),
            username VARCHAR(40) NOT NULL UNIQUE,
            name VARCHAR(50) NOT NULL,
            surname VARCHAR(50) NOT NULL,
            email VARCHAR(320) NOT NULL UNIQUE,
            password_hash CHAR(60) NOT NULL,
            role_id TINYINT UNSIGNED, FOREIGN KEY (role_id) REFERENCES ?? (id),
            account_status_id TINYINT UNSIGNED, FOREIGN KEY (account_status_id) REFERENCES ?? (id)
        );`, [DbTable.USERS, DbTable.LOOKUP_ROLES, DbTable.LOOKUP_USER_ACCOUNT_STATUS]);
        result = await pool.query(`CREATE TABLE ?? (id INT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (id), user_id INT UNSIGNED NOT NULL, venue_id INT UNSIGNED NOT NULL, UNIQUE(user_id, venue_id), FOREIGN KEY (user_id) REFERENCES ?? (id), FOREIGN KEY (venue_id) REFERENCES ?? (id));`, [DbTable.USER_FAVOURITE_VENUES, DbTable.USERS, DbTable.VENUES]);
        created = true;
    } catch (err) {
        logger.error(err);
        throw err;
    }

    return created;
}
async function insertTestData() {
    let inserted = false;
    try {
        let result;
        result = await pool.query(`
            INSERT INTO ?? (id, name, geo_lat, geo_lng, address, rating) VALUES 
            (1, 'Splendid Kebabs', 2, 1, '42 Bla Avenue, Madrid', 4),
            (2, 'The Kebaberie', 5, 2, '101 Santa Monica Way, Madrid', 3),
            (3, 'Meats Peeps', 7, 8, '276 Rita St, Madrid', 4),
            (4, 'The Rotisserie', 1, 9, '7 Rick Road, Madrid', 3),
            (5, 'The Dirty One', 4, 1, '10 Banana Place, Madrid', 5),
            (6, 'Bodrum Conundrum', 5, 5, '55 High Five Drive, Madrid', 2)
            ;
        `, [DbTable.VENUES]);
        result = await pool.query(`
            INSERT INTO ?? (id, role) VALUES
            (?, 'admin'),        
            (?, 'user')
            ;
        `, [DbTable.LOOKUP_ROLES, Role.ADMIN, Role.USER]);
        result = await pool.query(`
            INSERT INTO ?? (id, status) VALUES
            (?, 'active'),        
            (?, 'inactive')
            ;
        `, [DbTable.LOOKUP_USER_ACCOUNT_STATUS, UserAccountStatus.ACTIVE, UserAccountStatus.INACTIVE]);
        result = await pool.query(`
            INSERT INTO ?? (id, username, name, surname, email, password_hash, role_id, account_status_id) VALUES 
            -- test hashes generated at: https://bcrypt-generator.com/
            -- plain pwd: bob1      rounds: 8   hash: $2y$08$9V7mg7B1O.m7vUTIizdTH.DjyiFOjPEa4tN/cQv9vwTv7.qbs7nu.
            (1, 'aard', 'Bob', 'Smithers', 'aard@smithers.com', '$2y$08$9V7mg7B1O.m7vUTIizdTH.DjyiFOjPEa4tN/cQv9vwTv7.qbs7nu.', ?, ?),                       
            -- plain pwd: lucy1     rounds: 8   hash: $2y$08$NrLM7FPM9K/iYhCnnAL26.QWBkUTdr4aN9m0DVelbZvRMz/A3Qf5q
            (2, 'Babs', 'Lucy', 'Matthews', 'babs@matthews.co.uk', '$2y$08$NrLM7FPM9K/iYhCnnAL26.QWBkUTdr4aN9m0DVelbZvRMz/A3Qf5q', ?, ?),                     
            -- plain pwd: percy1    rounds: 8   hash: $2y$08$wCDuc5ZmfwMp28GPmxP5uOejOvz3mkogp5KF3nkTwez3K8L8q.yFC
            (3, 'MeatyMan', 'Percy', 'Archibald-Hyde', 'meatyman@archibald-hyde.eu', '$2y$08$wCDuc5ZmfwMp28GPmxP5uOejOvz3mkogp5KF3nkTwez3K8L8q.yFC', ?, ?),   
            -- plain pwd: farquhar1 rounds: 8   hash: $2y$08$Zz23B5j431OdTEP2oW0jDuc7krZkdNIXgK.cIILnQuZDTD2RKq2q6
            (4, 'kAb0000B', 'Farquhar', 'Rogers', 'kAb0000B@rogers.me', '$2y$08$Zz23B5j431OdTEP2oW0jDuc7krZkdNIXgK.cIILnQuZDTD2RKq2q6', ?, ?),                
            -- plain pwd: gigi1 rounds: 8   hash: $2y$08$jjz84rVjTkq0TrGQkxYKdejiCLLSzUdPLQTdsrDLDl.PeB/b0xv5y
            (5, 'ItsGigi', 'Gigi', 'McInactive-User', 'gigi@gmail.com', '$2y$08$jjz84rVjTkq0TrGQkxYKdejiCLLSzUdPLQTdsrDLDl.PeB/b0xv5y', ?, ?)
            ;
        `, [
                DbTable.USERS,                
                Role.ADMIN, UserAccountStatus.ACTIVE,
                Role.USER, UserAccountStatus.ACTIVE,
                Role.USER, UserAccountStatus.ACTIVE,
                Role.USER, UserAccountStatus.ACTIVE,
                Role.USER, UserAccountStatus.INACTIVE
            ]);
        result = await pool.query(`
            INSERT INTO ?? (id, user_id, venue_id) VALUES 
            (1, 1, 5), -- aard has favourited The Dirty One
            (2, 1, 4), -- aard has favourited The Rotisserie
            (3, 2, 3), -- Babs has favourited Meats Peeps
            (4, 2, 4), -- Babs has favourited The Rotisserie
            (5, 2, 2), -- Babs has favourited The Kebaberie
            (6, 4, 6)  -- kAb0000B has Bodrum Conundrum 
            ;
        `, [DbTable.USER_FAVOURITE_VENUES]);

        inserted = true;
    } catch (err) {
        logger.error(err);
        throw err;
    }

    return inserted;
}
async function resetTestDB() {
    let reset = false;

    try {
        let result;
        result = await dropDatabase();
        result = await createDatabase();
        result = await setTargetDB();
        result = await createTables();
        result = await insertTestData();
        reset = true;
    } catch (err) {
        logger.error(err);
        throw err;
    }

    return reset;
}

async function checkDBExists() {
    let exists = false;
    try {
        const result = await pool.query(`SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?;`, [KEBAPI_DB_NAME]);
        if (result[0] && result[0].SCHEMA_NAME && result[0].SCHEMA_NAME === KEBAPI_DB_NAME) {
            exists = true;
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }

    return exists;
}
async function setTargetDB() {
    let set = false;
    try {
        const result = await pool.query(`USE ??;`, [KEBAPI_DB_NAME]);
        set = true;
    } catch (err) {
        logger.error(err);
        throw err;
    }

    return set;
}
async function checkTableExists(tableName) {
    let exists = false;
    try {
        const result = await pool.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1;`, [KEBAPI_DB_NAME, tableName]);
        if (result[0] && result[0].TABLE_NAME && result[0].TABLE_NAME === tableName) {
            exists = true;
        }
    } catch {
        logger.error(err);
        throw err;
    }

    return exists;
}
async function checkTablesExist() {
    let allExist = false;
    let notFound = [];
    try {
        // NOTE: forEach doesn't work well with async but for..of does.
        for (const tableName of DB_TABLES) {
            let exists = await checkTableExists(tableName);
            if (!exists) {
                notFound.push(tableName);
            }
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    if (notFound.length === 0) {
        allExist = true;
    }
    return {
        allExist: allExist,
        notFound: notFound
    };
}



/* - - - - - Venues - - - - - */

async function getVenue(id) {
    let result = new Array();
    let venueId = parseId(id);
    try {
        result = await pool.query(`SELECT id, name, geo_lat, geo_lng, address FROM ?? WHERE id = ?;`, [DbTable.VENUES, venueId]);
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return result;
}
async function getVenues(startRow, maxRows) {
    let result = new Array();
    try {
        let offset = parseStartRow(startRow);
        let limit = parseMaxRows(maxRows);
        result = await pool.query(`SELECT id, name FROM ?? LIMIT ?, ?;`, [DbTable.VENUES, offset, limit]);
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return result;
}

/* - - - - - Users - - - - - */

async function addUser(username, name, surname, email, passwordHash, roleId) {
    // insertId Will remain undefined if no insert occurs, or be newly inserted row number, or be
    // 0 if insert is duplicate (so 0 can indicate to a calling fn that no action is needed)
    let insertId; 
    try {
        // Account status id will default to UserAccountStatus.ACTIVE
        const result = await pool.query(`INSERT IGNORE INTO ?? (username, name, surname, email, password_hash, role_id, account_status_id) VALUES (?, ?, ?, ?, ?, ?, ?);`, [DbTable.USERS, username, name, surname, email, passwordHash, roleId, UserAccountStatus.ACTIVE]);
        if (result.insertId > 0) {
            insertId = result.insertId;
        } else if (result.insertId === 0 && result.warningCount > 0) {
            // Detecting a duplicate insert in MySQL seems very convoluted.
            // We need to check the warnings with another query.
            const warningResult = await pool.query(`SHOW WARNINGS;`);
            logger.warn(JSON.stringify(warningResult));
            if (warningResult && warningResult[0] && warningResult[0].Code === DbErr.ER_DUP_ENTRY) {
                // Row was ignored duplicate, insertId will be 0.
                insertId = result.insertId;
            }
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return insertId;
}
async function activateUser(id) {
    let result = new Array();
    let userId = parseId(id);
    try {
        result = await pool.query(`UPDATE ?? SET account_status_id = ? WHERE id = ? LIMIT 1;`, [DbTable.USERS, UserAccountStatus.ACTIVE, userId]);        
        return updateOK(result);
    } catch (err) {
        logger.error(err);
        throw err;
    }
}
async function deactivateUser(id) {
    let result = new Array();
    let userId = parseId(id);
    try {
        result = await pool.query(`UPDATE ?? SET account_status_id = ? WHERE id = ? LIMIT 1;`, [DbTable.USERS, UserAccountStatus.INACTIVE, userId]);
        return updateOK(result);
    } catch (err) {
        logger.error(err);
        throw err;
    }
}
async function getUser(id) {
    let result = new Array();
    let userId = parseId(id);
    try {
        result = await pool.query(`SELECT id, username, name, surname, email, password_hash, role_id, account_status_id FROM ?? WHERE id = ?;`, [DbTable.USERS, userId]);
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return result;
}
async function getUserByEmail(email) {
    let result = new Array();
    let userEmail = parseEmail(email);
    try {
        result = await pool.query(`SELECT id, username, name, surname, email, password_hash, role_id, account_status_id FROM ?? WHERE email = ?;`, [DbTable.USERS, userEmail]);
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return result;
}
async function getUserByUserName(userName) {
    let result = new Array();
    let uname = parseString(userName);
    try {
        result = await pool.query(`SELECT id, username, name, surname, email, password_hash, role_id, account_status_id FROM ?? WHERE username = ?;`, [DbTable.USERS, uname]);
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return result;
}
async function getUserRole(id) {
    let result = new Array();
    let userId = parseId(id);
    try {
        result = await pool.query(`SELECT r.id, role FROM ?? AS r INNER JOIN ?? AS u ON r.id = u.role_id WHERE u.id = ?;`, [DbTable.LOOKUP_ROLES, DbTable.USERS, userId]);
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return result;
}
async function getUserAccountStatus(id) {
    let result = new Array();
    let userId = parseId(id);
    try {
        result = await pool.query(`SELECT uas.id, status FROM ?? AS uas INNER JOIN ?? AS u ON uas.id = u.account_status_id WHERE u.id = ?;`, [DbTable.LOOKUP_USER_ACCOUNT_STATUS, DbTable.USERS, userId]);
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return result;
}

async function getUsers(startRow, maxRows) {
    let result = new Array();
    try {
        let offset = parseStartRow(startRow);
        let limit = parseMaxRows(maxRows);
        result = await pool.query(`SELECT id, username FROM ?? LIMIT ?, ?;`, [DbTable.USERS, offset, limit]);
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return result;
}

async function getUserFavourites(id, startRow, maxRows) {
    let result = new Array();
    try {
        let userId = parseId(id);
        let offset = parseStartRow(startRow);
        let limit = parseMaxRows(maxRows);
        result = await pool.query(`SELECT venues.id, venues.name FROM ?? AS venues INNER JOIN ?? AS favourites ON venues.id = favourites.venue_id WHERE favourites.user_id = ? ORDER BY venues.name LIMIT ?, ?;`, [DbTable.VENUES, DbTable.USER_FAVOURITE_VENUES, userId, offset, limit]);
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return result;
}
async function addUserFavourite(id, venueID) {
    // insertId Will remain undefined if no insert occurs, or be newly inserted row number, or be
    // 0 if insert is duplicate (so 0 can indicate to a calling fn that no action is needed)
    let insertId;
    try {
        const result = await pool.query(`INSERT IGNORE INTO ?? (user_id, venue_id) VALUES (?, ?);`, [DbTable.USER_FAVOURITE_VENUES, id, venueID]);
        if (result.insertId > 0) {
            // Row was inserted, insertId will be id of newly inserted row
            insertId = result.insertId;
        } else if (result.insertId === 0 && result.warningCount > 0) {
            // Detecting a duplicate insert in MySQL seems very convoluted.
            // We need to check the warnings with another query.
            const warningResult = await pool.query(`SHOW WARNINGS;`);
            logger.warn(JSON.stringify(warningResult));
            if (warningResult && warningResult[0] && warningResult[0].Code === DbErr.ER_DUP_ENTRY) {
                // Row was ignored duplicate, insertId will be 0.
                insertId = result.insertId;
            }
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return insertId;
}
async function removeUserFavourite(id, venueID) {
    let removed = false;
    try {
        const result = await pool.query(`DELETE FROM ?? WHERE user_id = ? AND venue_id = ?;`, [DbTable.USER_FAVOURITE_VENUES, id, venueID]);
        if (result.affectedRows) {
            removed = true;
        }
        if (result.warningCount > 0) {
            const warningResult = await pool.query(`SHOW WARNINGS;`);
            logger.warn(JSON.stringify(warningResult));
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
    return removed;
}

/* - - - - - Data-parsing helpers - - - - - */

function parseId(id) {
    // If it can't be converted to a number, default to a numeric non-existent id that cannot be found or operated upon
    return Number(id) || -1; 
}
function parseEmail(email) {
    //TODO: Do proper email validation. Only ensuring it's a string for now
    return email && String(email).trim() || "";
}
function parseString(str) {
    return str && String(str).trim() || "";
}
function parseStartRow(startRow) {
    return Number(startRow) || 0;
}
function parseMaxRows(maxRows) {
    return Number(maxRows) <= KEBAPI_DB_DEFAULT_SELECT_MAX_ROWS ? maxRows : KEBAPI_DB_DEFAULT_SELECT_MAX_ROWS;
}

/* - - - - - Other helpers - - - - - */

// Check if an update went OK. With regard to REST, an UPDATE query result is OK whether
// it is repeated or not, so rows may or may not change on each update.
function updateOK(result) {
    if (result.affectedRows > 0 && (result.changedRows === 0 || result.changedRows === 1))
        return true;
    else
        return false;    
}


module.exports = {
    resetTestDB,
    checkDBExists, setTargetDB, checkTablesExist,
    getVenue, getVenues,
    addUser, activateUser, deactivateUser, getUser, getUserByEmail, getUserByUserName, getUsers, 
    getUserRole,
    getUserAccountStatus,
    getUserFavourites, addUserFavourite, removeUserFavourite
};