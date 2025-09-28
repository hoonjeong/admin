const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const db = require('../config/database');
const logger = require('../utils/logger');
const { hashPassword } = require('../utils/auth');

router.get('/login', (req, res) => {
    res.render('auth/login', { 
        error: req.query.error || null,
        success: req.query.success || null 
    });
});

router.post('/login', async (req, res) => {
    const { email, password, autoLogin } = req.body;
    
    try {
        const hashedPassword = hashPassword(password);

        const [rows] = await db.execute(
            'SELECT * FROM admin_user_info WHERE email = ? AND pw = ?',
            [email, hashedPassword]
        );
        
        if (rows.length > 0) {
            const user = rows[0];

            req.session.adminUser = {
                id: user.id,
                email: user.email,
                name: user.name,
                phone: user.phone,
                code: user.code
            };
            
            if (autoLogin) {
                req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30일
            } else {
                req.session.cookie.maxAge = null; // 브라우저 종료 시 만료
            }
            
            res.redirect('/admin/dashboard');
        } else {
            res.render('auth/login', { 
                error: '이메일 또는 비밀번호가 일치하지 않습니다.' 
            });
        }
    } catch (error) {
        logger.error('Login error', error);
        res.render('auth/login', { 
            error: '로그인 처리 중 오류가 발생했습니다.' 
        });
    }
});

router.get('/register', (req, res) => {
    res.render('auth/register', { error: null });
});

router.post('/register', async (req, res) => {
    const { email, name, phone, password } = req.body;
    
    try {
        const [existingUser] = await db.execute(
            'SELECT * FROM admin_user_info WHERE name = ? AND phone = ?',
            [name, phone]
        );
        
        if (existingUser.length === 0) {
            res.render('auth/register', { 
                error: '관리자 승인이 되지 않은 정보입니다. 관리자에게 문의해주세요.' 
            });
            return;
        }

        const hashedPassword = hashPassword(password);

        await db.execute(
            'UPDATE admin_user_info SET email = ?, pw = ?, insert_time = NOW() WHERE name = ? AND phone = ?',
            [email, hashedPassword, name, phone]
        );
        
        res.redirect('/auth/login?success=' + encodeURIComponent('회원가입이 완료되었습니다. 로그인해주세요.'));
    } catch (error) {
        logger.error('Register error', error);
        res.render('auth/register', { 
            error: '회원가입 처리 중 오류가 발생했습니다.' 
        });
    }
});

router.get('/find-email', (req, res) => {
    res.render('auth/find-email', { error: null, email: null });
});

router.post('/find-email', async (req, res) => {
    const { name, phone } = req.body;
    
    try {
        const [rows] = await db.execute(
            'SELECT email FROM admin_user_info WHERE name = ? AND phone = ?',
            [name, phone]
        );
        
        if (rows.length > 0 && rows[0].email) {
            const email = rows[0].email;
            const maskedEmail = email.substring(0, 3) + '*'.repeat(email.indexOf('@') - 3) + email.substring(email.indexOf('@'));
            
            res.render('auth/find-email', { 
                error: null, 
                email: maskedEmail 
            });
        } else {
            res.render('auth/find-email', { 
                error: '일치하는 회원 정보를 찾을 수 없습니다.', 
                email: null 
            });
        }
    } catch (error) {
        logger.error('Find email error', error);
        res.render('auth/find-email', { 
            error: '이메일 찾기 처리 중 오류가 발생했습니다.', 
            email: null 
        });
    }
});

router.get('/find-password', (req, res) => {
    res.render('auth/find-password', { error: null, success: null });
});

router.post('/find-password', async (req, res) => {
    const { name, phone, email } = req.body;
    
    try {
        const [rows] = await db.execute(
            'SELECT * FROM admin_user_info WHERE name = ? AND phone = ? AND email = ?',
            [name, phone, email]
        );
        
        if (rows.length === 0) {
            res.render('auth/find-password', { 
                error: '일치하는 회원 정보를 찾을 수 없습니다.', 
                success: null 
            });
            return;
        }
        
        const tempPassword = Math.random().toString(36).substring(2, 10);
        const hashedPassword = hashPassword(tempPassword);
        
        await db.execute(
            'UPDATE admin_user_info SET pw = ? WHERE email = ?',
            [hashedPassword, email]
        );
        
        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
        
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: '[이든배움국어학원] 임시 비밀번호 안내',
            html: `
                <div style="padding: 20px; font-family: Arial, sans-serif;">
                    <h2>임시 비밀번호 안내</h2>
                    <p>안녕하세요, ${name}님.</p>
                    <p>요청하신 임시 비밀번호를 안내드립니다.</p>
                    <div style="background: #f0f0f0; padding: 15px; margin: 20px 0; border-radius: 5px;">
                        <strong>임시 비밀번호: ${tempPassword}</strong>
                    </div>
                    <p>로그인 후 반드시 비밀번호를 변경해주세요.</p>
                    <p>감사합니다.</p>
                </div>
            `
        };
        
        await transporter.sendMail(mailOptions);
        
        res.render('auth/find-password', { 
            error: null,
            success: '임시 비밀번호가 이메일로 발송되었습니다. 이메일을 확인해주세요.' 
        });
    } catch (error) {
        logger.error('Find password error', error);
        res.render('auth/find-password', { 
            error: '비밀번호 찾기 처리 중 오류가 발생했습니다.', 
            success: null 
        });
    }
});

router.get('/logout', (req, res) => {
    if (req.session.adminUser) {
        delete req.session.adminUser;
    }
    req.session.save((err) => {
        if (err) {
            logger.error('Logout error', err);
        }
        res.redirect('/auth/login');
    });
});

module.exports = router;