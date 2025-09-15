/**
 * Async handler wrapper for Express routes
 * Automatically catches errors and passes them to error middleware
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Standard API response handler
 */
const apiResponse = {
    success: (res, data = null, message = 'Success', statusCode = 200) => {
        res.status(statusCode).json({
            success: true,
            message,
            data
        });
    },
    
    error: (res, message = 'Error occurred', statusCode = 500) => {
        res.status(statusCode).json({
            success: false,
            message
        });
    }
};

module.exports = {
    asyncHandler,
    apiResponse
};