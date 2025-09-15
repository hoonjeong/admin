const logger = require('./logger');

/**
 * 통일된 에러 처리 함수
 * @param {Object} res - Express response 객체
 * @param {Error} error - 에러 객체
 * @param {string} message - 사용자에게 표시할 메시지
 * @param {number} statusCode - HTTP 상태 코드
 */
const handleControllerError = (res, error, message = 'An error occurred', statusCode = 500) => {
    logger.error(message, error);

    // 개발 환경에서는 상세 에러 정보 포함
    const response = {
        success: false,
        message
    };

    if (process.env.NODE_ENV === 'development') {
        response.error = error.message;
        response.stack = error.stack;
    }

    res.status(statusCode).json(response);
};

/**
 * 데이터베이스 에러 처리
 * @param {Object} res - Express response 객체
 * @param {Error} error - 데이터베이스 에러
 */
const handleDatabaseError = (res, error) => {
    logger.error('Database error:', error);

    let message = 'Database error occurred';
    let statusCode = 500;

    // 특정 데이터베이스 에러에 대한 처리
    if (error.code === 'ER_DUP_ENTRY') {
        message = 'Duplicate entry found';
        statusCode = 409;
    } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        message = 'Referenced record not found';
        statusCode = 400;
    } else if (error.code === 'ER_DATA_TOO_LONG') {
        message = 'Data too long for field';
        statusCode = 400;
    }

    handleControllerError(res, error, message, statusCode);
};

/**
 * 검증 에러 처리
 * @param {Object} res - Express response 객체
 * @param {Array} errors - 검증 에러 배열
 */
const handleValidationError = (res, errors) => {
    const response = {
        success: false,
        message: 'Validation failed',
        errors: errors
    };

    res.status(400).json(response);
};

/**
 * 전역 에러 핸들러 미들웨어
 */
const globalErrorHandler = (err, req, res, next) => {
    logger.error('Global error handler:', err);

    const response = {
        success: false,
        message: 'Internal server error'
    };

    if (process.env.NODE_ENV === 'development') {
        response.error = err.message;
        response.stack = err.stack;
    }

    res.status(500).json(response);
};

module.exports = {
    handleControllerError,
    handleDatabaseError,
    handleValidationError,
    globalErrorHandler
};