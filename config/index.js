module.exports = {
    // 서버 설정
    server: {
        port: process.env.PORT || 3000,
        env: process.env.NODE_ENV || 'development'
    },
    
    // 데이터베이스 설정
    database: {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        connectionLimit: 10,
        waitForConnections: true,
        queueLimit: 0
    },
    
    // 세션 설정
    session: {
        secret: process.env.SESSION_SECRET || 'default-secret-key-for-development',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            sameSite: 'strict',
            maxAge: process.env.SESSION_MAX_AGE ? parseInt(process.env.SESSION_MAX_AGE) : null
        }
    },
    
    // 이메일 설정
    email: {
        user: process.env.EMAIL_USER,
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT || 587,
        pass: process.env.EMAIL_PASS,
        secure: false
    },
    
    // SMS 설정
    sms: {
        userId: process.env.SMS_USER_ID,
        authKey: process.env.SMS_AUTH_KEY,
        callNum: process.env.SMS_CALL_NUMBER || '010-9363-6362',
        mode: process.env.SMS_MODE || 'Test',
        apiUrl: process.env.SMS_API_URL || 'http://www.sms9.co.kr/authSendApi/authSendApi_UTF8.php'
    },

    // 파일 업로드 설정
    upload: {
        maxFileSize: 50 * 1024 * 1024, // 50MB
        maxFiles: 10,
        allowedTypes: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'zip'],
        uploadDir: 'upload'
    },
    
    // 보안 설정
    security: {
        bcryptRounds: 10,
        passwordMinLength: 8,
        loginAttempts: 5,
        lockoutTime: 15 * 60 * 1000 // 15분
    }
};