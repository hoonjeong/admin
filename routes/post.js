const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { isAdminAuthenticated, isAdmin } = require('../middleware/adminAuth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { AppError } = require('../utils/errorHandler');
// const { sanitizeInput } = require('../utils/validators');
const logger = require('../utils/logger');
const { getPostsWithCommentCount, getPostWithDetails, deletePostWithFiles } = require('../utils/database');
const { asyncHandler, apiResponse, withTransaction } = require('../utils/asyncHandler');
const { POST_CATEGORIES, FILE_LIMITS, PAGINATION } = require('../utils/constants');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'upload/posts';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext);
        cb(null, baseName + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: FILE_LIMITS.MAX_SIZE
    }
});

// 글쓰기 페이지
router.get('/write', isAdminAuthenticated, isAdmin, (req, res, next) => {
    try {
        res.render('post/write', {
            user: req.session.adminUser,
            categories: POST_CATEGORIES,
            title: '글쓰기'
        });
    } catch (error) {
        next(error);
    }
});

// 글쓰기 처리
router.post('/write', isAdminAuthenticated, isAdmin, upload.array('files', 10), async (req, res, next) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { subject, contents, category, meta_keyword, meta_description } = req.body;
        const userId = req.session.adminUser.id;
        
        // 게시글 삽입
        const postResult = await connection.query(
            `INSERT INTO post_info (subject, contents, code, user_id, category, meta_keyword, meta_description, read_count, insert_time)
             VALUES (?, ?, 'P', ?, ?, ?, ?, 0, NOW())`,
            [subject, contents, userId, category, meta_keyword || '', meta_description || '']
        );
        
        const postId = postResult[0].insertId;
        
        // 파일 처리
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                // file_info 테이블에 파일 정보 삽입
                const fileResult = await connection.query(
                    `INSERT INTO file_info (filename, filepath, filesize, mimetype, category, insert_time)
                     VALUES (?, ?, ?, ?, 'post', NOW())`,
                    [file.originalname, file.path, file.size, file.mimetype]
                );
                
                const fileId = fileResult[0].insertId;
                
                // post_file_status 테이블에 관계 삽입
                await connection.query(
                    `INSERT INTO post_file_status (post_id, file_id, insert_time)
                     VALUES (?, ?, NOW())`,
                    [postId, fileId]
                );
            }
        }
        
        await connection.commit();
        
        res.json({
            success: true,
            message: '게시글이 등록되었습니다.',
            postId: postId
        });
        
    } catch (error) {
        await connection.rollback();
        logger.error('Post write error:', error);
        res.status(500).json({
            success: false,
            message: '게시글 등록 중 오류가 발생했습니다.'
        });
    } finally {
        connection.release();
    }
});

// 글 목록
router.get('/list', isAdminAuthenticated, isAdmin, async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const search = req.query.search || '';
        const category = req.query.category || '';
        
        const result = await getPostsWithCommentCount(db, {
            page,
            limit: 20,
            search,
            category
        });
        
        // Add category names
        result.posts.forEach(post => {
            post.categoryName = POST_CATEGORIES[post.category] || post.category;
        });
        
        res.render('post/list', {
            user: req.session.adminUser,
            posts: result.posts,
            categories: POST_CATEGORIES,
            currentPage: page,
            totalPages: result.totalPages,
            search: search,
            selectedCategory: category,
            title: '글관리'
        });
        
    } catch (error) {
        logger.error('Post list error:', error);
        next(error);
    }
});

// 글 상세보기
router.get('/view/:id', isAdminAuthenticated, async (req, res, next) => {
    try {
        const postId = req.params.id;
        const result = await getPostWithDetails(db, postId);
        
        if (!result) {
            throw new AppError('게시글을 찾을 수 없습니다.', 404);
        }
        
        result.post.categoryName = POST_CATEGORIES[result.post.category] || result.post.category;
        
        res.render('post/view', {
            user: req.session.adminUser,
            post: result.post,
            files: result.files,
            comments: result.comments,
            title: result.post.subject
        });
        
    } catch (error) {
        logger.error('Post view error:', error);
        next(error);
    }
});

// 글 수정 페이지
router.get('/edit/:id', isAdminAuthenticated, isAdmin, async (req, res, next) => {
    try {
        const postId = req.params.id;
        
        // 게시글 조회
        const posts = await db.query(
            'SELECT * FROM post_info WHERE id = ?',
            [postId]
        );
        
        if (posts[0].length === 0) {
            throw new AppError('게시글을 찾을 수 없습니다.', 404);
        }
        
        // 첨부파일 조회
        const files = await db.query(
            `SELECT f.* FROM file_info f
             JOIN post_file_status pfs ON f.id = pfs.file_id
             WHERE pfs.post_id = ?`,
            [postId]
        );
        
        res.render('post/edit', {
            user: req.session.adminUser,
            post: posts[0][0],
            files: files[0],
            categories: POST_CATEGORIES,
            title: '글 수정'
        });
        
    } catch (error) {
        logger.error('Post edit page error:', error);
        next(error);
    }
});

// 글 수정 처리
router.post('/edit/:id', isAdminAuthenticated, isAdmin, upload.array('files', 10), async (req, res, next) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const postId = req.params.id;
        const { subject, contents, category, meta_keyword, meta_description, deleteFiles } = req.body;
        
        // 게시글 수정
        await connection.query(
            `UPDATE post_info 
             SET subject = ?, contents = ?, category = ?, 
                 meta_keyword = ?, meta_description = ?
             WHERE id = ?`,
            [subject, contents, category, meta_keyword || '', meta_description || '', postId]
        );
        
        // 삭제할 파일 처리
        if (deleteFiles) {
            const fileIds = Array.isArray(deleteFiles) ? deleteFiles : [deleteFiles];
            for (const fileId of fileIds) {
                // 파일 정보 조회
                const fileInfo = await connection.query(
                    'SELECT filepath FROM file_info WHERE id = ?',
                    [fileId]
                );
                
                if (fileInfo[0].length > 0) {
                    // 물리적 파일 삭제
                    const filepath = fileInfo[0][0].filepath;
                    if (fs.existsSync(filepath)) {
                        fs.unlinkSync(filepath);
                    }
                    
                    // DB에서 삭제
                    await connection.query(
                        'DELETE FROM post_file_status WHERE file_id = ?',
                        [fileId]
                    );
                    await connection.query(
                        'DELETE FROM file_info WHERE id = ?',
                        [fileId]
                    );
                }
            }
        }
        
        // 새 파일 추가
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const [fileResult] = await connection.query(
                    `INSERT INTO file_info (filename, filepath, filesize, mimetype, category, insert_time)
                     VALUES (?, ?, ?, ?, 'post', NOW())`,
                    [file.originalname, file.path, file.size, file.mimetype]
                );
                
                const fileId = fileResult.insertId;
                
                await connection.query(
                    `INSERT INTO post_file_status (post_id, file_id, insert_time)
                     VALUES (?, ?, NOW())`,
                    [postId, fileId]
                );
            }
        }
        
        await connection.commit();
        
        res.json({
            success: true,
            message: '게시글이 수정되었습니다.'
        });
        
    } catch (error) {
        await connection.rollback();
        logger.error('Post edit error:', error);
        res.status(500).json({
            success: false,
            message: '게시글 수정 중 오류가 발생했습니다.'
        });
    } finally {
        connection.release();
    }
});

// 글 삭제
router.delete('/delete/:id', isAdminAuthenticated, isAdmin, async (req, res, next) => {
    try {
        const postId = req.params.id;
        await deletePostWithFiles(db, postId);
        
        res.json({
            success: true,
            message: '게시글이 삭제되었습니다.'
        });
        
    } catch (error) {
        logger.error('Post delete error:', error);
        res.status(500).json({
            success: false,
            message: '게시글 삭제 중 오류가 발생했습니다.'
        });
    }
});

// 에디터 이미지 업로드 API
router.post('/api/upload-image', isAdminAuthenticated, upload.single('upload'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: {
                    message: '파일이 업로드되지 않았습니다.'
                }
            });
        }

        const file = req.file;

        // 이미지 파일인지 확인
        if (!file.mimetype.startsWith('image/')) {
            // 업로드된 파일 삭제
            fs.unlinkSync(file.path);
            return res.status(400).json({
                error: {
                    message: '이미지 파일만 업로드할 수 있습니다.'
                }
            });
        }

        // DB에 파일 정보 저장
        const [result] = await db.query(
            `INSERT INTO file_info (filename, filepath, filesize, mimetype, category, insert_time)
             VALUES (?, ?, ?, ?, 'editor_image', NOW())`,
            [file.originalname, file.path, file.size, file.mimetype]
        );

        const fileId = result.insertId;

        // 웹에서 접근 가능한 URL 생성
        const imageUrl = `/post/api/image/${fileId}`;

        res.json({
            url: imageUrl
        });

    } catch (error) {
        logger.error('Image upload error:', error);

        // 업로드된 파일이 있다면 삭제
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: {
                message: '이미지 업로드 중 오류가 발생했습니다.'
            }
        });
    }
});

// 에디터 이미지 서빙
router.get('/api/image/:fileId', async (req, res) => {
    try {
        const fileId = req.params.fileId;

        const [files] = await db.query(
            'SELECT * FROM file_info WHERE id = ?',
            [fileId]
        );

        if (files.length === 0) {
            return res.status(404).json({ error: '이미지를 찾을 수 없습니다.' });
        }

        const file = files[0];

        if (!fs.existsSync(file.filepath)) {
            return res.status(404).json({ error: '이미지 파일이 존재하지 않습니다.' });
        }

        // 이미지 파일 서빙
        res.setHeader('Content-Type', file.mimetype);
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1년 캐시
        res.sendFile(path.resolve(file.filepath));

    } catch (error) {
        logger.error('Image serving error:', error);
        res.status(500).json({ error: '이미지 로딩 중 오류가 발생했습니다.' });
    }
});

// 파일 다운로드
router.get('/download/:fileId', isAdminAuthenticated, async (req, res, next) => {
    try {
        const fileId = req.params.fileId;

        const files = await db.query(
            'SELECT * FROM file_info WHERE id = ?',
            [fileId]
        );

        if (files[0].length === 0) {
            throw new AppError('파일을 찾을 수 없습니다.', 404);
        }

        const file = files[0][0];

        if (!fs.existsSync(file.filepath)) {
            throw new AppError('파일이 존재하지 않습니다.', 404);
        }

        res.download(file.filepath, file.filename);

    } catch (error) {
        logger.error('File download error:', error);
        next(error);
    }
});

module.exports = router;