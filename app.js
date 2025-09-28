const express = require('express');
const session = require('express-session');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const logger = require('./utils/logger');
const { globalErrorHandler } = require('./utils/errorHandler');

const homeRoutes = require('./routes/home');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const teacherRoutes = require('./routes/teacher');
const classRoutes = require('./routes/class');
const studentRoutes = require('./routes/student');
const lectureRoutes = require('./routes/lecture');
const postRoutes = require('./routes/post');
const smsRoutes = require('./routes/sms');
const aiRoutes = require('./routes/ai');
const examRoutes = require('./routes/exam');
const userRoutes = require('./routes/user');
const boardRoutes = require('./routes/board');
const videoRoutes = require('./routes/video');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 개발 환경에서 EJS 캐시 비활성화
if (process.env.NODE_ENV !== 'production') {
    app.set('view cache', false);
}

// 개발 환경에서 정적 파일 캐시 비활성화
app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    lastModified: false,
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const corsOptions = {
    origin: true,
    credentials: true
};
app.use(cors(corsOptions));

const sessionSecret = process.env.SESSION_SECRET || 'default-secret-key-for-development';

app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        sameSite: 'strict',
        maxAge: null
    }
}));

// 개발 환경에서 캐시 비활성화 헤더 추가
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        next();
    });
}

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

app.get('/admin-login', (req, res, next) => {
    try {
        if (req.session && req.session.user) {
            return res.redirect('/admin/dashboard');
        } else {
            return res.redirect('/auth/login');
        }
    } catch (error) {
        return next(error);
    }
});

app.use('/', homeRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/teacher', teacherRoutes);
app.use('/class', classRoutes);
app.use('/student', studentRoutes);
app.use('/lecture', lectureRoutes);
app.use('/post', postRoutes);
app.use('/sms', smsRoutes);
app.use('/ai', aiRoutes);
app.use('/exam', examRoutes);
app.use('/user', userRoutes);
app.use('/board', boardRoutes);
app.use('/video', videoRoutes);

app.use((req, res) => {
    res.status(404).render('404');
});

app.use(globalErrorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
});