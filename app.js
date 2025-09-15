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

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
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
        maxAge: null // 명시적으로 null 설정 - 세션 쿠키
    }
}));

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

app.use((req, res) => {
    res.status(404).render('404');
});

app.use(globalErrorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
});