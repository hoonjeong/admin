const isDevelopment = process.env.NODE_ENV !== 'production';

const logger = {
    info: (message, ...args) => {
        if (isDevelopment) {
            console.log(`[INFO] ${message}`, ...args);
        }
    },
    
    error: (message, error = null) => {
        const timestamp = new Date().toISOString();
        if (error) {
            console.error(`[ERROR] ${timestamp} - ${message}:`, error.message || error);
        } else {
            console.error(`[ERROR] ${timestamp} - ${message}`);
        }
    },
    
    warn: (message, ...args) => {
        if (isDevelopment) {
            console.warn(`[WARN] ${message}`, ...args);
        }
    },
    
    debug: (message, ...args) => {
        if (isDevelopment && process.env.DEBUG === 'true') {
            console.log(`[DEBUG] ${message}`, ...args);
        }
    }
};

module.exports = logger;