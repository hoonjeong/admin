const { AppError } = require('../utils/errorHandler');

const isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
            return res.status(401).json({ 
                success: false, 
                message: '로그인이 필요합니다.' 
            });
        }
        return res.redirect('/auth/login');
    }
    next();
};

const isNotAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return res.redirect('/admin/dashboard');
    }
    next();
};

const isAdmin = (req, res, next) => {
    if (req.session?.user?.code === 'O') {
        return next();
    }
    next(new AppError('접근 권한이 없습니다.', 403));
};

const isTeacher = (req, res, next) => {
    if (req.session?.user && 
        (req.session.user.code === 'T' || req.session.user.code === 'O')) {
        return next();
    }
    next(new AppError('선생님 권한이 필요합니다.', 403));
};

const checkRole = (...roles) => {
    return (req, res, next) => {
        if (req.session?.user && roles.includes(req.session.user.code)) {
            return next();
        }
        next(new AppError('접근 권한이 없습니다.', 403));
    };
};

module.exports = {
    isAuthenticated,
    isNotAuthenticated,
    isAdmin,
    isTeacher,
    checkRole
};