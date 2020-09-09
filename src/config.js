/**
 * A 12-factor config. (All config in 1 file/1 place.)
 *
 * Looks in Environment or returns the specified defaults
 *
 * Note: process.env is set when Node process boots
 * */
module.exports = {
    KEBAPI_CONFIG_NAME: process.env.KEBAPI_CONFIG_NAME || 'kebapi-default-config',
    // Node env
    NODE_ENV: process.env.NODE_ENV || 'development',
    // Server
    KEBAPI_SERVER_PORT: parseInt(process.env.KEBAPI_SERVER_PORT, 10) || 8080,
    KEBAPI_SERVER_POST_MAX_SIZE: parseInt(process.env.KEBAPI_SERVER_POST_MAX_SIZE, 10) || 16 * 1024,
    // DB
    KEBAPI_DB_NAME: process.env.KEBAPI_DB_NAME || 'kebabd_db',
    KEBAPI_DB_DEFAULT_SELECT_MAX_ROWS: parseInt(process.env.KEBAPI_DB_DEFAULT_SELECT_MAX_ROWS, 10) || 100,
    KEBAPI_DB_POOL_CONNECTION_LIMIT: parseInt(process.env.KEBAPI_DB_POOL_CONNECTION_LIMIT, 10) || 10,
    KEBAPI_DB_HOST: process.env.KEBAPI_DB_HOST || 'localhost',
    KEBAPI_DB_USER: process.env.KEBAPI_DB_USER || 'admin',
    KEBAPI_DB_PASSWORD: process.env.KEBAPI_DB_PASSWORD || 'admin',
    KEBAPI_DB_CHARSET: process.env.KEBAPI_DB_CHARSET || 'utf8mb4',
    KEBAPI_DB_TIMEZONE: process.env.KEBAPI_DB_TIMEZONE || 'z',
    KEBAPI_DB_MAX_PATH_SIZE: parseInt(process.env.KEBAPI_DB_MAX_PATH_SIZE, 10) || 260, // Max path size for files. Configurable since upper limit can vary by OS and data store.
    // Authorisation
    KEBAPI_AUTH_SECRET: process.env.KEBAPI_AUTH_SECRET || 'c0876970129d079ea69c96c30475b557', // a random MD5 hash
    KEBAPI_AUTH_TOKEN_EXPIRY_MS: process.env.KEBAPI_AUTH_TOKEN_EXPIRY_MS || 86400 // 24 hours
};


/*
    // For any future changes to this config, here are some examples of
    // handling various primitives, plus with/without default.

    module.exports = {
        A_STRING: process.env.A_STRING || 'default-string',
        A_VALUE_NO_DEFAULT: process.env.A_VALUE_NO_DEFAULT,
        A_URL: process.env.A_URL || 'localhost:8080',
        A_BOOLEAN: process.env.A_BOOLEAN === 'true',
        A_NUMBER: parseInt(process.env.A_NUMBER, 10) || 10,
    };

 */
