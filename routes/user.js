const express = require('express');
const db = require('../config/database');
const { sendVerificationSMS, saveVerificationCode, verifyCode } = require('../utils/sms');
const { hashPassword } = require('../utils/auth');
const logger = require('../utils/logger');

const router = express.Router();

// 회원가입 페이지
router.get('/register', (req, res) => {
    res.render('user/register', {
        title: '회원가입 - 이든배움국어학원',
        error: null,
        success: null,
        userInfo: req.session.userInfo || null
    });
});

// 로그인 페이지
router.get('/login', (req, res) => {
    let message = null;
    if (req.query.message === '퇴원처리로인한로그아웃') {
        message = '퇴원 처리되어 로그아웃되었습니다. 학원으로 문의해주세요.';
    }

    res.render('user/login', {
        title: '로그인 - 이든배움국어학원',
        error: null,
        message: message,
        redirect: req.query.redirect || null
    });
});

// 전화번호 인증 요청
router.post('/verify-phone', async (req, res) => {
    try {
        const { phone, type } = req.body;

        if (!phone || !type) {
            return res.status(400).json({ error: '전화번호와 구분을 입력해주세요.' });
        }

        // SMS 발송 및 인증번호 생성
        const result = await sendVerificationSMS(phone);

        if (!result.success) {
            return res.status(500).json({ error: 'SMS 발송에 실패했습니다. 다시 시도해주세요.' });
        }

        // 데이터베이스에 인증번호 저장 시도 (실패해도 SMS는 발송됨)
        try {
            await saveVerificationCode(phone, result.verificationCode, 'signup', 3);
        } catch (dbError) {
            logger.error('인증번호 DB 저장 실패 (SMS는 발송됨):', dbError);
            // DB 저장 실패해도 SMS는 발송되었으므로 계속 진행
        }

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
        logger.error('SMS 발송 실패', error);
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

        // 데이터베이스에서 인증번호 확인 시도
        let isValid = false;
        try {
            isValid = await verifyCode(phone, code, 'signup');
        } catch (dbError) {
            logger.error('DB 인증번호 확인 실패, 세션 확인으로 대체:', dbError);
        }

        // DB 확인이 실패한 경우 세션에서 확인
        if (!isValid && req.session.verification) {
            const sessionVerification = req.session.verification;
            if (sessionVerification.phone === phone &&
                sessionVerification.code === code &&
                sessionVerification.expires > Date.now()) {
                isValid = true;
                // 세션 기반 인증번호 확인 성공 (과도한 로그 제거)
            }
        }

        if (!isValid) {
            return res.status(400).json({ error: '인증번호가 일치하지 않거나 만료되었습니다.' });
        }

        // 학생 테이블에서 전화번호 확인 (퇴원 상태도 함께 확인)
        const phoneColumn = type === 'student' ? 'sphone' : 'pphone';
        const [students] = await db.execute(
            `SELECT id, sphone, pphone, name, liveStatus FROM student WHERE ${phoneColumn} = ?`,
            [phone]
        );

        if (students.length === 0) {
            return res.status(400).json({
                error: '재원생만 이용 가능합니다. 재원생일 경우, 학원으로 문의 부탁드립니다.'
            });
        }

        const student = students[0];

        // 퇴원 처리된 학생 회원가입 차단
        if (student.liveStatus === 'N') {
            logger.warn(`퇴원 처리된 학생 회원가입 시도: ${phone}, 학생명: ${student.name}`);
            return res.status(403).json({
                error: '퇴원 처리된 학생은 회원가입할 수 없습니다. 학원으로 문의해주세요.'
            });
        }

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
        logger.error('인증번호 확인 오류', error);
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
        logger.error('이메일 확인 오류', error);
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

        // 비밀번호 해시화
        const hashedPassword = hashPassword(password);

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
        logger.error('회원가입 오류', error);
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

        // 먼저 이메일로 계정이 존재하는지 확인
        const [emailCheck] = await db.execute(`
            SELECT ui.*, s.name as student_name, s.liveStatus
            FROM user_info ui
            JOIN student s ON ui.student_id = s.id
            WHERE ui.email = ? AND ui.code = "S"
        `, [email]);

        if (emailCheck.length === 0) {
            logger.warn(`존재하지 않는 이메일로 로그인 시도: ${email}`);
            return res.status(400).json({ error: '등록되지 않은 이메일입니다. 이메일을 확인해주세요.' });
        }

        // 비밀번호 해시화
        const hashedPassword = hashPassword(password);

        // 이메일과 비밀번호 모두 확인
        const [passwordCheck] = await db.execute(`
            SELECT ui.*, s.name as student_name, s.liveStatus
            FROM user_info ui
            JOIN student s ON ui.student_id = s.id
            WHERE ui.email = ? AND ui.pw = ? AND ui.code = "S"
        `, [email, hashedPassword]);

        if (passwordCheck.length === 0) {
            logger.warn(`비밀번호 불일치 로그인 시도: ${email}, 학생명: ${emailCheck[0].student_name}`);
            return res.status(400).json({ error: '비밀번호가 잘못되었습니다. 비밀번호를 확인해주세요.' });
        }

        const user = passwordCheck[0];

        // 퇴원 처리된 학생인지 확인
        if (user.liveStatus === 'N') {
            logger.warn(`퇴원 처리된 학생 로그인 시도: ${email}, 학생명: ${user.student_name}`);
            return res.status(403).json({
                error: '퇴원 처리된 학생은 로그인할 수 없습니다. 학원으로 문의해주세요.'
            });
        }

        // 모든 검증을 통과한 활성 학생 - 로그인 성공

        // 세션에 사용자 정보 저장
        req.session.userInfo = {
            id: user.id,
            email: user.email,
            studentId: user.student_id,
            sphone: user.sphone,
            pphone: user.pphone,
            studentName: user.student_name,
            liveStatus: user.liveStatus
        };

        logger.info(`학생 로그인 성공: ${email}, 학생명: ${user.student_name}`);

        // redirect 파라미터가 있으면 해당 URL로, 없으면 홈으로 이동
        const redirectUrl = req.body.redirect || '/';

        res.json({
            success: true,
            message: '로그인되었습니다.',
            redirectUrl: redirectUrl
        });

    } catch (error) {
        logger.error('로그인 오류', error);
        res.status(500).json({ error: '로그인 중 오류가 발생했습니다.' });
    }
});

// 내정보 보기 페이지
router.get('/profile', async (req, res) => {
    try {
        // 로그인 체크
        if (!req.session.userInfo) {
            return res.redirect('/user/login?redirect=' + encodeURIComponent('/user/profile'));
        }

        const userInfo = req.session.userInfo;

        // user_info 테이블에서 사용자 정보 가져오기
        const [userRows] = await db.execute(
            'SELECT id, email, student_id FROM user_info WHERE id = ?',
            [userInfo.id]
        );

        if (userRows.length === 0 || !userRows[0].student_id) {
            return res.status(404).send('사용자 정보를 찾을 수 없습니다.');
        }

        const user = userRows[0];

        // student 테이블에서 학생 정보 가져오기
        const [studentRows] = await db.execute(
            'SELECT name, school, grade, year, pphone, sphone FROM student WHERE id = ?',
            [user.student_id]
        );

        if (studentRows.length === 0) {
            return res.status(404).send('학생 정보를 찾을 수 없습니다.');
        }

        const student = studentRows[0];

        res.render('user/profile', {
            title: '내정보 - 이든배움국어학원',
            user: user,
            student: student,
            userInfo: userInfo
        });

    } catch (error) {
        logger.error('Profile error', error);
        res.status(500).send('내정보 조회 중 오류가 발생했습니다.');
    }
});

// 로그아웃
router.post('/logout', (req, res) => {
    // 홈페이지 사용자 세션만 삭제 (관리자 세션은 유지)
    if (req.session.userInfo) {
        delete req.session.userInfo;
    }
    if (req.session.studentInfo) {
        delete req.session.studentInfo;
    }
    if (req.session.verification) {
        delete req.session.verification;
    }

    req.session.save((err) => {
        if (err) {
            return res.status(500).json({ error: '로그아웃 중 오류가 발생했습니다.' });
        }
        res.json({ success: true, redirectUrl: '/' });
    });
});


module.exports = router;