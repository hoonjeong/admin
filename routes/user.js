const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const { sendVerificationSMS, saveVerificationCode, verifyCode } = require('../utils/sms');
const { initSMSTables } = require('../utils/dbInit');

const router = express.Router();

// 회원가입 페이지
router.get('/register', (req, res) => {
    res.render('user/register', {
        title: '회원가입 - 이든배움국어학원',
        error: null,
        success: null
    });
});

// 로그인 페이지
router.get('/login', (req, res) => {
    res.render('user/login', {
        title: '로그인 - 이든배움국어학원',
        error: null
    });
});

// 전화번호 인증 요청
router.post('/verify-phone', async (req, res) => {
    try {
        // SMS 테이블 초기화
        await initSMSTables();

        const { phone, type } = req.body;

        if (!phone || !type) {
            return res.status(400).json({ error: '전화번호와 구분을 입력해주세요.' });
        }

        // SMS 발송 및 인증번호 생성
        const result = await sendVerificationSMS(phone);

        if (!result.success) {
            return res.status(500).json({ error: 'SMS 발송에 실패했습니다. 다시 시도해주세요.' });
        }

        // 데이터베이스에 인증번호 저장 (3분 유효)
        await saveVerificationCode(phone, result.verificationCode, 'signup', 3);

        // 세션에도 저장 (기존 로직 호환성)
        req.session.verification = {
            phone: phone,
            type: type,
            code: result.verificationCode,
            expires: Date.now() + 3 * 60 * 1000
        };

        res.json({
            success: true,
            message: '인증번호가 발송되었습니다. 3분 내에 입력해주세요.'
        });
    } catch (error) {
        console.error('SMS 발송 실패:', error);
        res.status(500).json({ error: 'SMS 발송에 실패했습니다. 다시 시도해주세요.' });
    }
});

// 인증번호 확인
router.post('/verify-code', async (req, res) => {
    try {
        const { code, phone, type } = req.body;

        if (!phone || !code || !type) {
            return res.status(400).json({ error: '필수 정보가 누락되었습니다.' });
        }

        // 데이터베이스에서 인증번호 확인
        const isValid = await verifyCode(phone, code, 'signup');

        if (!isValid) {
            return res.status(400).json({ error: '인증번호가 일치하지 않거나 만료되었습니다.' });
        }

        // 학생 테이블에서 전화번호 확인
        const phoneColumn = type === 'student' ? 'sphone' : 'pphone';
        const [students] = await db.execute(
            `SELECT id, sphone, pphone FROM student WHERE ${phoneColumn} = ?`,
            [phone]
        );

        if (students.length === 0) {
            return res.status(400).json({
                error: '재원생만 이용 가능합니다. 재원생일 경우, 학원으로 문의 부탁드립니다.'
            });
        }

        const student = students[0];

        // user_info에서 기존 회원 확인
        const [userInfos] = await db.execute(
            'SELECT email, code FROM user_info WHERE student_id = ?',
            [student.id]
        );

        if (userInfos.length > 0) {
            const userInfo = userInfos[0];

            if (userInfo.code === 'S') {
                return res.json({
                    status: 'existing',
                    message: '이미 가입된 회원입니다.',
                    redirectUrl: '/user/login'
                });
            } else if (userInfo.code === 'D') {
                // 재가입 처리
                await db.execute(
                    'UPDATE user_info SET code = "S" WHERE student_id = ?',
                    [student.id]
                );

                return res.json({
                    status: 'reactivated',
                    message: `재가입을 환영합니다! 기존 이메일(${userInfo.email})로 로그인해주세요.`,
                    email: userInfo.email,
                    redirectUrl: '/user/login'
                });
            }
        }

        // 세션에 학생 정보 저장
        req.session.studentInfo = {
            studentId: student.id,
            sphone: student.sphone,
            pphone: student.pphone
        };

        res.json({
            status: 'new',
            message: '인증이 완료되었습니다.',
            redirectUrl: '/user/signup'
        });

    } catch (error) {
        console.error('인증번호 확인 오류:', error);
        res.status(500).json({ error: '인증 처리 중 오류가 발생했습니다.' });
    }
});

// 회원가입 상세 페이지
router.get('/signup', (req, res) => {
    if (!req.session.studentInfo) {
        return res.redirect('/user/register');
    }

    res.render('user/signup', {
        title: '회원가입 - 이든배움국어학원',
        studentInfo: req.session.studentInfo,
        error: null
    });
});

// 이메일 중복 확인
router.post('/check-email', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: '이메일을 입력해주세요.' });
        }

        const [users] = await db.execute(
            'SELECT id FROM user_info WHERE email = ?',
            [email]
        );

        if (users.length > 0) {
            return res.json({ available: false, message: '이미 사용 중인 이메일입니다.' });
        }

        res.json({ available: true, message: '사용 가능한 이메일입니다.' });
    } catch (error) {
        console.error('이메일 확인 오류:', error);
        res.status(500).json({ error: '이메일 확인 중 오류가 발생했습니다.' });
    }
});

// 회원가입 처리
router.post('/signup', async (req, res) => {
    try {
        const { email, password, confirmPassword } = req.body;

        if (!req.session.studentInfo) {
            return res.status(400).json({ error: '세션이 만료되었습니다. 다시 시도해주세요.' });
        }

        if (!email || !password || !confirmPassword) {
            return res.status(400).json({ error: '모든 필드를 입력해주세요.' });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ error: '비밀번호가 일치하지 않습니다.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: '비밀번호는 6자리 이상이어야 합니다.' });
        }

        const { studentId, sphone, pphone } = req.session.studentInfo;

        // 이메일 중복 확인
        const [existingUsers] = await db.execute(
            'SELECT id FROM user_info WHERE email = ?',
            [email]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({ error: '이미 사용 중인 이메일입니다.' });
        }

        // SHA1으로 비밀번호 해시화
        const hashedPassword = crypto.createHash('sha1').update(password).digest('hex');

        // 회원가입 처리
        await db.execute(
            `INSERT INTO user_info (email, pw, sphone, pphone, code, student_id, insert_time)
             VALUES (?, ?, ?, ?, 'S', ?, NOW())`,
            [email, hashedPassword, sphone, pphone, studentId]
        );

        // 세션 정리
        delete req.session.studentInfo;

        res.json({
            success: true,
            message: '회원가입이 완료되었습니다. 로그인해주세요.',
            redirectUrl: '/user/login'
        });

    } catch (error) {
        console.error('회원가입 오류:', error);
        res.status(500).json({ error: '회원가입 중 오류가 발생했습니다.' });
    }
});

// 로그인 처리
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
        }

        // SHA1으로 비밀번호 해시화
        const hashedPassword = crypto.createHash('sha1').update(password).digest('hex');

        // 사용자 확인
        const [users] = await db.execute(
            'SELECT * FROM user_info WHERE email = ? AND pw = ? AND code = "S"',
            [email, hashedPassword]
        );

        if (users.length === 0) {
            return res.status(400).json({ error: '이메일 또는 비밀번호가 잘못되었습니다.' });
        }

        const user = users[0];

        // 세션에 사용자 정보 저장
        req.session.userInfo = {
            id: user.id,
            email: user.email,
            studentId: user.student_id,
            sphone: user.sphone,
            pphone: user.pphone
        };

        res.json({
            success: true,
            message: '로그인되었습니다.',
            redirectUrl: '/'
        });

    } catch (error) {
        console.error('로그인 오류:', error);
        res.status(500).json({ error: '로그인 중 오류가 발생했습니다.' });
    }
});

// 로그아웃
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: '로그아웃 중 오류가 발생했습니다.' });
        }
        res.json({ success: true, redirectUrl: '/' });
    });
});


module.exports = router;