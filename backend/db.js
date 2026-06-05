const mysql = require("mysql2");

const basePool = mysql.createPool({
    host: process.env.DB_HOST || "db",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "root",
    database: process.env.DB_NAME || "med_system",
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

basePool.on("connection", (connection) => {
    connection.query("SET NAMES utf8mb4 COLLATE utf8mb4_polish_ci");
});

module.exports = basePool.promise();
