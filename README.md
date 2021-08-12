# kebapi

<br>
<br>

<blockquote>
<p align="center">
<span style="font-size:1.4rem;">An asynchronous Promise-based vanilla Node.js REST API, specifically written without the usual frameworks to explore core Node.js, and to satisfy a not-so-secret lust for dirty kebabs!</span>
</p>
</blockquote>

<br>

<p align="center">
  <img src="doc/kebab-30deg.svg" width="200" />
</p>

<br>
<br>

The purpose of the API is to implement a small set of operations that can serve discerning kebab-eating clients everywhere. (There is a juicy [ASP.NET version](https://github.com/critr/KebapiAspNet) too!)

The API fronts a MySQL database, and the project includes home-brewed implementations of routing, logins replete with user roles and permissions, command line handling, a fairly dandy test-runner with a whole bunch of unit tests, and a coloured logger that formats and highlights output consistently and nicely. Login and security are built upon bcrypt and JSON Web Tokens. (bcryptjs, jsonwebtoken, and mysql are the only external libs used.) Config is entirely Environment-based.

On the data side, there are scripted rebuilds of the database schema, including test data loading (both triggerable in Dev-mode from the API), and the database model includes typical normalisation and PK/FK/data integrity constraints.

Here's a quick demo video of kebapi with its media server powering an early protoype Android/Flutter front-end:

https://user-images.githubusercontent.com/28576622/129194364-bcaf4a9e-435a-4065-bb83-76cffe326d94.mp4

You can just about see kebapi logging as it responds to user input on the device.



### 🥙 Get started
You will need a [MySQL](https://www.mysql.com/) database server running.

Download the kebapi repo.

Then, if it's the fist run, you'll probably need to set up the database and load some data. To do that, go to the project root and in your bash/command prompt hit:

```bash
$ node scripts/resetTestDB.js
```
WARNING! All previous data will be blitzed every time you run that script!

If the database has already been set up before and has data in it, then from the project root, you can always start the server with:

```bash
$ node server.js
```

You can tweak kebapi settings in the config, covered next.

### 🥙 Config
All configuration is Environment-based, falling back to reasonable defaults, and handled in a single file: config.js

Here are its settings:

```javascript
module.exports = {
    KEBAPI_CONFIG_NAME: process.env.KEBAPI_CONFIG_NAME || 'kebapi-default-config',
    // Node env
    NODE_ENV: process.env.NODE_ENV || 'development',
    // Server
    KEBAPI_SERVER_PORT: parseInt(process.env.KEBAPI_SERVER_PORT, 10) || 8080,
    KEBAPI_SERVER_POST_MAX_SIZE: parseInt(process.env.KEBAPI_SERVER_POST_MAX_SIZE, 10) || 16*1024,
    // DB
    KEBAPI_DB_NAME: process.env.KEBAPI_DB_NAME || 'kebabd_db',
    KEBAPI_DB_DEFAULT_SELECT_MAX_ROWS: parseInt(process.env.KEBAPI_DB_DEFAULT_SELECT_MAX_ROWS, 10) || 100,
    KEBAPI_DB_POOL_CONNECTION_LIMIT: parseInt(process.env.KEBAPI_DB_POOL_CONNECTION_LIMIT, 10) || 10,
    KEBAPI_DB_HOST: process.env.KEBAPI_DB_HOST || 'localhost',
    KEBAPI_DB_USER: process.env.KEBAPI_DB_USER || 'admin',
    KEBAPI_DB_PASSWORD: process.env.KEBAPI_DB_PASSWORD || 'admin',
    KEBAPI_DB_CHARSET: process.env.KEBAPI_DB_CHARSET || 'utf8mb4',
    KEBAPI_DB_TIMEZONE: process.env.KEBAPI_DB_TIMEZONE || 'z',
    // Authorisation
    KEBAPI_AUTH_SECRET: process.env.KEBAPI_AUTH_SECRET || 'c0876970129d079ea69c96c30475b557', // a random MD5 hash
    KEBAPI_AUTH_TOKEN_EXPIRY_MS: process.env.KEBAPI_AUTH_TOKEN_EXPIRY_MS || 86400 // 24 hours
};
```
### 🥙 API Endpoints
It's best to use something like [Insomnia](https://insomnia.rest/) or [Postman](https://www.getpostman.com/) to fire off requests with the correct HTTP methods and data, otherwise you'll likely get unexpected results.

Many resources (Endpoints) are either owned by a user, or restricted by role. So if you are not logged in and supplying the required token with your request, the most likely result you'll get is a 401 (Unauthorised) response together with a "Missing an expected token" message.

To get the expected response, just log in (or register a new user and then log in), and then supply the returned token in your next requests.

#### Admin and Dev Environment testing
These endpoints are only available if user is admin and our Environment `NODE_ENV` variable is set to `'development'`. See Config section.

| Method | Endpoint | Description| Example
|----|------------|------------|------------
|GET|`gettoken/:id`| Gets a signed token for an id.|[`http://localhost:8080/gettoken/11`](http://localhost:8080/gettoken/11)
|GET|`verifytoken/:token`|Verifies the specified token.|[`http://localhost:8080/verifytoken/eyJhbGciOiJIUz...`](http://localhost:8080/verifytoken/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NiwiaWF0IjoxNTY1NTk5OTExLCJleHAiOjE1NjU2ODYzMTF9.gjk0awNAq7evxLqGd_zGvbNd1BiQ9JpApu3LSKyrzms)
|GET|`gethash/:value`|Hashes the specified value.|[`http://localhost:8080/gethash/99`](http://localhost:8080/gethash/99)
|GET|`resettestdb`|Rebuilds database schema and loads test data.|[`http://localhost:8080/resettestdb`](http://localhost:8080/resettestdb)

#### Kebab venues/eateries

| Method | Endpoint	| Description| Example
|----|------------|------------|------------
|GET|`venues/:venueId`|Retrieves details of a single place of kebab worship, by its id.|[`http://localhost:8080/venues/2`](http://localhost:8080/venues/2)
|GET|`venues (optional: ?startRow=n&maxRows=n)`|Retrieves a list of fine kebab Meccas.|[`http://localhost:8080/venues`](http://localhost:8080/venues)

#### Discerning clientele

| Method | Endpoint	| Description| Example
|----|------------|------------|------------
|GET|`users/:id/favourites/`|Gets a user's list of favourited venues by id.|[`http://localhost:8080/users/3/favourites`](http://localhost:8080/users/3/favourites)
|GET|`users/:id/role/`|Gets a user's registered role by id (e.g. admin or user).|[`http://localhost:8080/users/3/role`](http://localhost:8080/users/3/role)
|GET|`users/:id/status/`|Gets a user's account status by id (e.g. active or inactive (i.e. "deleted")).|[`http://localhost:8080/users/3/favourites`](http://localhost:8080/users/3/favourites)
|GET|`users/:id/`|Gets a user's details by id.|[`http://localhost:8080/users/3`](http://localhost:8080/users/3)
|GET|`users (optional: ?startRow=n&maxRows=n)`|Gets a list of users.|[`http://localhost:8080/users`](http://localhost:8080/users)
|POST|`users/login`|Logs in a registered user. (Requires x-www-form-urlencoded fields: username OR email, password)|[`http://localhost:8080/users/login`](http://localhost:8080/users/login)
|POST|`users/register`|Registers a new user. (Requires x-www-form-urlencoded fields: username, name, surname, email, password)|[`http://localhost:8080/users/register`](http://localhost:8080/users/register)
|POST|`users/:userId/favourites/:venueId`|Adds a new favourite venue to a user.|[`http://localhost:8080/users/3/favourites/1`](http://localhost:8080/users/3/favourites/1)
|POST|`users/:userId`|Marks a user's account as being active (i.e. "un-deleted").|[`http://localhost:8080/users/3`](http://localhost:8080/users/3)
|DELETE|`users/:userId/favourites/:venueId`|Removes a favourited venue from a user.|[`http://localhost:8080/users/3/favourites/1`](http://localhost:8080/users/3/favourites/1)
|DELETE|`users/:userId`|Marks a user's account as being inactive (i.e. "deleted").|[`http://localhost:8080/users/3`](http://localhost:8080/users/3)

### 🥙 Troubleshooting

Should you have problems connecting to the MySQL database, check the user is set correctly in MySQL. See this note:
```javascript
// NOTE: Due to changed security, MySQL80 will require executing something
// like this for the user we will use to connect to the database:
//
// ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '[password-for-root]'
// or
// ALTER USER 'username'@'%' IDENTIFIED WITH mysql_native_password BY '[password-for-username]'
```
You may need to run one of those queries in MySQL Workbench. Be sure to substitute the correct user for the one you've set up in MySQL.

<br>

<p align="center">
  <img src="doc/kebab2.svg" width="200" />
</p>
<br>

<sub>Some tastefully sourced kebab icons slightly tweaked by [critr](https://github.com/critr) and lovingly made by <a href="https://www.flaticon.com/authors/smashicons" title="Smashicons">Smashicons</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a></sub>
