const express = require('express');
const router = express.Router();
const { isAdminAuthenticated, isAdmin } = require('../middleware/adminAuth');
const logger = require('../utils/logger');
const db = require('../config/database');

// FAQ 목록 페이지
router.get('/', [isAdminAuthenticated, isAdmin], async (req, res) => {
    try {
        const { category } = req.query;

        let query = 'SELECT * FROM faq_info';
        let params = [];

        if (category && category !== 'all') {
            query += ' WHERE category = ?';
            params.push(category);
        }

        query += ' ORDER BY insert_time DESC';

        const [rows] = await db.execute(query, params);

        res.render('admin/faq-list', {
            faqs: rows,
            category,
            user: req.session.adminUser
        });
    } catch (error) {
        logger.error('FAQ 목록 조회 오류', error);
        res.status(500).render('error', { message: 'FAQ 목록을 불러오는 중 오류가 발생했습니다.' });
    }
});

// FAQ 추가 페이지
router.get('/add', [isAdminAuthenticated, isAdmin], async (req, res) => {
    try {

        // 기존 카테고리 목록 조회
        const [categories] = await db.execute(
            'SELECT DISTINCT category FROM faq_info ORDER BY category ASC'
        );

        res.render('admin/faq-form', {
            mode: 'add',
            faq: {},
            categories: categories.map(c => c.category),
            user: req.session.adminUser
        });
    } catch (error) {
        logger.error('FAQ 추가 페이지 로딩 오류', error);
        res.status(500).render('error', { message: '페이지를 불러오는 중 오류가 발생했습니다.' });
    }
});

// FAQ 추가 처리
router.post('/add', [isAdminAuthenticated, isAdmin], async (req, res) => {
    try {
        const { category, question, answer } = req.body;

        if (!category || !question || !answer) {
            return res.json({ success: false, message: '모든 필드를 입력해주세요.' });
        }


        await db.execute(
            'INSERT INTO faq_info (category, question, answer, insert_time) VALUES (?, ?, ?, NOW())',
            [category, question, answer]
        );

        res.json({ success: true, message: 'FAQ가 성공적으로 등록되었습니다.' });
    } catch (error) {
        logger.error('FAQ 추가 오류', error);
        res.json({ success: false, message: 'FAQ 등록 중 오류가 발생했습니다.' });
    }
});

// FAQ 수정 페이지
router.get('/edit/:id', [isAdminAuthenticated, isAdmin], async (req, res) => {
    try {
        const faqId = req.params.id;

        const [rows] = await db.execute(
            'SELECT * FROM faq_info WHERE id = ?',
            [faqId]
        );

        if (rows.length === 0) {
            return res.status(404).render('error', { message: 'FAQ를 찾을 수 없습니다.' });
        }

        // 기존 카테고리 목록 조회
        const [categories] = await db.execute(
            'SELECT DISTINCT category FROM faq_info ORDER BY category ASC'
        );

        res.render('admin/faq-form', {
            mode: 'edit',
            faq: rows[0],
            categories: categories.map(c => c.category),
            user: req.session.adminUser
        });
    } catch (error) {
        logger.error('FAQ 조회 오류', error);
        res.status(500).render('error', { message: 'FAQ를 불러오는 중 오류가 발생했습니다.' });
    }
});

// FAQ 수정 처리
router.put('/edit/:id', [isAdminAuthenticated, isAdmin], async (req, res) => {
    try {
        const { category, question, answer } = req.body;
        const faqId = req.params.id;

        if (!category || !question || !answer) {
            return res.json({ success: false, message: '모든 필드를 입력해주세요.' });
        }


        const [result] = await db.execute(
            'UPDATE faq_info SET category = ?, question = ?, answer = ? WHERE id = ?',
            [category, question, answer, faqId]
        );


        if (result.affectedRows === 0) {
            return res.json({ success: false, message: 'FAQ를 찾을 수 없습니다.' });
        }

        res.json({ success: true, message: 'FAQ가 성공적으로 수정되었습니다.' });
    } catch (error) {
        logger.error('FAQ 수정 오류', error);
        res.json({ success: false, message: 'FAQ 수정 중 오류가 발생했습니다.' });
    }
});

// FAQ 삭제 처리
router.delete('/delete/:id', [isAdminAuthenticated, isAdmin], async (req, res) => {
    try {
        const faqId = req.params.id;

        const [result] = await db.execute(
            'DELETE FROM faq_info WHERE id = ?',
            [faqId]
        );


        if (result.affectedRows === 0) {
            return res.json({ success: false, message: 'FAQ를 찾을 수 없습니다.' });
        }

        res.json({ success: true, message: 'FAQ가 성공적으로 삭제되었습니다.' });
    } catch (error) {
        logger.error('FAQ 삭제 오류', error);
        res.json({ success: false, message: 'FAQ 삭제 중 오류가 발생했습니다.' });
    }
});

module.exports = router;