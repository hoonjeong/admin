const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 20,  // 연결 풀 크기 증가
    queueLimit: 0,
    timezone: '+00:00',
    charset: 'utf8mb4',
    // 성능 최적화 옵션 추가
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    multipleStatements: true  // 다중 쿼리 실행 허용
});

const promisePool = pool.promise();

module.exports = promisePool;