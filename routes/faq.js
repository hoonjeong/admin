const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const db = require('../config/database');
const { incrementViewCount } = require('../utils/viewTracker');

// 사용자 FAQ 페이지
router.get('/', async (req, res) => {
    try {
        const { category, all } = req.query;
        const showAll = all === 'true';

        let popularFaqs = [];
        let allFaqs = [];

        if (!category || category === 'all') {
            if (!showAll) {
                // 인기 FAQ (조회수 높은 순 5개)
                const [popularRows] = await db.execute(
                    'SELECT * FROM faq_info ORDER BY read_count DESC LIMIT 5'
                );
                popularFaqs = popularRows;
            } else {
                // 전체 FAQ
                const [allRows] = await db.execute(
                    'SELECT * FROM faq_info ORDER BY insert_time DESC'
                );
                allFaqs = allRows;
            }
        } else {
            // 카테고리별 FAQ
            const [categoryRows] = await db.execute(
                'SELECT * FROM faq_info WHERE category = ? ORDER BY insert_time DESC',
                [category]
            );
            allFaqs = categoryRows;
        }

        // 모든 카테고리 목록 조회 (카테고리 필터용)
        const [allCategories] = await db.execute(
            'SELECT DISTINCT category FROM faq_info ORDER BY category ASC'
        );


        res.render('faq/index', {
            popularFaqs,
            allFaqs,
            category,
            showAll: showAll || !!category,
            categories: allCategories.map(c => c.category),
            userInfo: req.session.userInfo || null
        });
    } catch (error) {
        logger.error('FAQ 페이지 로딩 오류', error);
        res.status(500).render('error', { message: '페이지를 불러오는 중 오류가 발생했습니다.' });
    }
});

// FAQ 조회수 증가
router.post('/view/:id', async (req, res) => {
    try {
        const faqId = req.params.id;

        // 조회수 증가 (중복 방지 로직 포함)
        await incrementViewCount(db, req.session, 'faq', faqId, 'faq_info');

        res.json({ success: true });
    } catch (error) {
        logger.error('조회수 증가 오류', error);
        res.json({ success: false, message: '조회수 증가 중 오류가 발생했습니다.' });
    }
});

module.exports = router;