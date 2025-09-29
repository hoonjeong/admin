const express = require('express');
const router = express.Router();
const db = require('../config/database');
const logger = require('../utils/logger');

// 카테고리 매핑
const categoryMap = {
    'N': '공지사항',
    'S': '이든이야기',
    'C': '입시정보',
    'D': '입시자료',
    'R': '수강후기'
};

// 게시판 목록
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const category = req.query.category || 'all';
        const limit = 10;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        let queryParams = [];

        if (category !== 'all') {
            whereClause += ' AND category = ?';
            queryParams.push(category);
        }

        // 게시글 조회
        const postsQuery = `
            SELECT p.*, u.name as author_name,
                   (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
            FROM post_info p
            LEFT JOIN user_info u ON p.user_id = u.id
            ${whereClause}
            ORDER BY p.insert_time DESC
            LIMIT ? OFFSET ?
        `;

        queryParams.push(limit, offset);
        const [posts] = await db.execute(postsQuery, queryParams);

        // 전체 게시글 수 조회
        const countQuery = `SELECT COUNT(*) as total FROM post_info p ${whereClause}`;
        const [countResult] = await db.execute(countQuery, queryParams.slice(0, -2));
        const totalPosts = countResult[0].total;
        const totalPages = Math.ceil(totalPosts / limit);

        const boardTitle = category === 'all' ? '전체보기' : categoryMap[category] || '전체보기';

        res.render('board/index', {
            posts,
            currentPage: page,
            totalPages,
            currentCategory: category,
            boardTitle,
            userInfo: req.session.userInfo
        });
    } catch (error) {
        logger.error('Board list error', error);
        res.status(500).send('게시판 조회 중 오류가 발생했습니다.');
    }
});

// 게시글 상세보기
router.get('/:id', async (req, res) => {
    try {
        const postId = req.params.id;

        // 세션 기반 조회수 중복 방지
        if (!req.session.viewedPosts) {
            req.session.viewedPosts = {};
        }

        const sessionKey = `post_${postId}`;
        const lastViewed = req.session.viewedPosts[sessionKey];
        const now = Date.now();

        // 마지막 조회로부터 5분(300,000ms)이 지났거나 처음 조회하는 경우만 조회수 증가
        if (!lastViewed || (now - lastViewed) > 300000) {
            await db.execute('UPDATE post_info SET read_count = read_count + 1 WHERE id = ?', [postId]);
            req.session.viewedPosts[sessionKey] = now;
        }

        // 게시글 조회
        const [posts] = await db.execute(`
            SELECT p.*, u.name as author_name
            FROM post_info p
            LEFT JOIN user_info u ON p.user_id = u.id
            WHERE p.id = ?
        `, [postId]);

        if (posts.length === 0) {
            return res.status(404).send('게시글을 찾을 수 없습니다.');
        }

        const post = posts[0];

        // 댓글 조회
        const [comments] = await db.execute(`
            SELECT c.*,
                   CASE
                       WHEN c.user_id IS NOT NULL THEN CONCAT(LEFT(u.email, 2), REPEAT('*', LENGTH(u.email) - 2))
                       ELSE c.anonymous_name
                   END as author_display
            FROM comments c
            LEFT JOIN user_info u ON c.user_id = u.id
            WHERE c.post_id = ?
            ORDER BY c.created_at ASC
        `, [postId]);

        // 댓글 수 업데이트
        post.comment_count = comments.length;

        res.render('board/detail', {
            post,
            comments,
            userInfo: req.session.userInfo,
            req: req
        });
    } catch (error) {
        logger.error('Post detail error', error);
        res.status(500).send('게시글 조회 중 오류가 발생했습니다.');
    }
});

// 댓글 작성
router.post('/:id/comment', async (req, res) => {
    try {
        const postId = req.params.id;
        const { content } = req.body;

        if (!content || content.trim() === '') {
            return res.status(400).json({ error: '댓글 내용을 입력해주세요.' });
        }

        let userId = null;
        let anonymousName = null;

        if (req.session.userInfo) {
            // 로그인한 회원
            userId = req.session.userInfo.id;
        } else {
            // 비회원 - 고유 익명 이름 생성
            const clientId = req.ip + req.headers['user-agent'];
            const hash = require('crypto').createHash('md5').update(clientId).digest('hex');
            const anonymousId = parseInt(hash.substring(0, 8), 16) % 10000;
            anonymousName = `익명${anonymousId}`;
        }

        await db.execute(`
            INSERT INTO comments (post_id, user_id, anonymous_name, content, created_at)
            VALUES (?, ?, ?, ?, NOW())
        `, [postId, userId, anonymousName, content.trim()]);

        res.json({ success: true, message: '댓글이 작성되었습니다.' });
    } catch (error) {
        logger.error('Comment create error', error);
        res.status(500).json({ error: '댓글 작성 중 오류가 발생했습니다.' });
    }
});

// 글쓰기 페이지
router.get('/write', (req, res) => {
    if (!req.session.userInfo) {
        return res.redirect('/user/login?redirect=/board/write');
    }

    const category = req.query.category || '';
    res.render('board/write', {
        category,
        userInfo: req.session.userInfo
    });
});

// 글쓰기 처리
router.post('/write', async (req, res) => {
    try {
        if (!req.session.userInfo) {
            return res.status(401).json({ error: '로그인이 필요합니다.' });
        }

        const { title, content, category, metaDescription, metaKeyword } = req.body;

        if (!title || !content || !category) {
            return res.status(400).json({ error: '제목, 내용, 카테고리를 모두 입력해주세요.' });
        }

        const [result] = await db.execute(`
            INSERT INTO post_info (user_id, subject, contents, category, meta_description, meta_keyword, insert_time)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `, [req.session.userInfo.id, title, content, category, metaDescription, metaKeyword]);

        res.json({ success: true, postId: result.insertId });
    } catch (error) {
        logger.error('Post create error', error);
        res.status(500).json({ error: '게시글 작성 중 오류가 발생했습니다.' });
    }
});

module.exports = router;