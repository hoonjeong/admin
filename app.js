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
const faqRoutes = require('./routes/faq');
const adminFaqRoutes = require('./routes/admin-faq');

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

// 학생 세션 상태 확인 미들웨어
app.use(async (req, res, next) => {
    // 학생 로그인 세션이 있는 경우에만 확인
    if (req.session.userInfo && req.session.userInfo.studentId) {
        try {
            const db = require('./config/database');
            const [students] = await db.execute(
                'SELECT liveStatus FROM student WHERE id = ?',
                [req.session.userInfo.studentId]
            );

            // 학생이 퇴원 처리된 경우 세션 삭제
            if (students.length > 0 && students[0].liveStatus === 'N') {
                delete req.session.userInfo;
                if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
                    return res.status(403).json({
                        error: '퇴원 처리되어 로그아웃되었습니다. 학원으로 문의해주세요.',
                        redirectUrl: '/user/login'
                    });
                } else {
                    req.session.save((err) => {
                        return res.redirect('/user/login?message=퇴원처리로인한로그아웃');
                    });
                    return;
                }
            }
        } catch (error) {
            // 학생 상태 확인 오류 (로그 제거 - 운영 환경에서 불필요)
        }
    }
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
app.use('/faq', faqRoutes);
app.use('/admin/faq', adminFaqRoutes);

app.use((req, res) => {
    res.status(404).render('404');
});

app.use(globalErrorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
});