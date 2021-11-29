const mysql = require('mysql');
const util = require('util');

// ENV //
require('dotenv').config();

const dbConnection = mysql.createConnection({
    host: process.env.db_host,
    user: process.env.db_user,
    port: process.env.db_port,
    password: process.env.db_password,
    database: process.env.db_name
});

// node native promisify
// https://stackoverflow.com/questions/44004418/node-js-async-await-using-with-mysql
const dbQuery = util.promisify(dbConnection.query).bind(dbConnection);

module.exports = {dbConnection, dbQuery};