const { AppError } = require('../utils/errorHandler');

const isAdminAuthenticated = (req, res, next) => {
    if (!req.session.adminUser) {
        if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
            return res.status(401).json({
                success: false,
                message: '관리자 로그인이 필요합니다.'
            });
        }
        return res.redirect('/auth/login');
    }
    next();
};

const isAdminNotAuthenticated = (req, res, next) => {
    if (req.session.adminUser) {
        return res.redirect('/admin/dashboard');
    }
    next();
};

const isAdmin = (req, res, next) => {
    if (req.session?.adminUser?.code === 'O') {
        return next();
    }
    next(new AppError('관리자 권한이 없습니다.', 403));
};

const isTeacher = (req, res, next) => {
    if (req.session?.adminUser &&
        (req.session.adminUser.code === 'T' || req.session.adminUser.code === 'O')) {
        return next();
    }
    next(new AppError('선생님 권한이 필요합니다.', 403));
};

const checkAdminRole = (...roles) => {
    return (req, res, next) => {
        if (req.session?.adminUser && roles.includes(req.session.adminUser.code)) {
            return next();
        }
        next(new AppError('접근 권한이 없습니다.', 403));
    };
};

module.exports = {
    isAdminAuthenticated,
    isAdminNotAuthenticated,
    isAdmin,
    isTeacher,
    checkAdminRole
};