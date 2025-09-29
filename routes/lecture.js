const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { isAdminAuthenticated } = require('../middleware/adminAuth');
const db = require('../config/database');
const logger = require('../utils/logger');

router.use(isAdminAuthenticated);

const uploadDir = path.join(__dirname, '..', 'upload');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext);
        cb(null, basename + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }
});

router.get('/add', async (req, res) => {
    try {
        const [teachers] = await db.execute(
            'SELECT name FROM admin_user_info WHERE code = ? ORDER BY name',
            ['T']
        );
        
        const [classes] = await db.execute(
            'SELECT id, name FROM class_info WHERE liveStatus = 1 ORDER BY name'
        );
        
        res.render('lecture/add', {
            teachers,
            classes,
            pageTitle: '강의 추가',
            user: req.session.adminUser
        });
    } catch (error) {
        logger.error('Error loading lecture add page', error);
        res.status(500).render('error', { error });
    }
});

router.post('/add', upload.array('files', 10), async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { subject, description, teacher, url, lectureDate, classIds } = req.body;
        const selectedClasses = Array.isArray(classIds) ? classIds : [classIds];
        
        const fileIds = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const [fileResult] = await connection.execute(
                    'INSERT INTO file_info (filename, filedata, insert_time) VALUES (?, null, NOW())',
                    [file.filename]
                );
                fileIds.push(fileResult.insertId);
            }
        }
        
        for (const classId of selectedClasses) {
            const [lectureResult] = await connection.execute(
                `INSERT INTO lecture (subject, description, url, teacher, code, class_id, insert_time, lecture_date) 
                 VALUES (?, ?, ?, ?, 'L', ?, NOW(), ?)`,
                [subject, description, url, teacher, classId, lectureDate]
            );
            
            const lectureId = lectureResult.insertId;
            
            for (const fileId of fileIds) {
                await connection.execute(
                    'INSERT INTO file_status (lecture_id, file_id, insert_time) VALUES (?, ?, NOW())',
                    [lectureId, fileId]
                );
            }
        }
        
        await connection.commit();
        res.redirect('/lecture/list');
        
    } catch (error) {
        await connection.rollback();
        logger.error('Error adding lecture', error);
        res.status(500).render('error', { error });
    } finally {
        connection.release();
    }
});

// 선생님별 담당 클래스 조회 API
router.get('/api/classes-by-teacher/:teacherName', async (req, res) => {
    try {
        const { teacherName } = req.params;

        // class_info와 class_status를 조인하여 live 상태인 클래스만 가져오기
        // teacherOne 또는 teacherTwo 필드가 일치하는 클래스들을 조회
        const [classes] = await db.execute(`
            SELECT DISTINCT ci.id, ci.name
            FROM class_info ci
            INNER JOIN class_status cs ON ci.id = cs.class_id
            WHERE ci.liveStatus = 1
            AND cs.status = 'live'
            AND (ci.teacherOne = ? OR ci.teacherTwo = ?)
            ORDER BY ci.name
        `, [teacherName, teacherName]);

        res.json({ success: true, classes });
    } catch (error) {
        logger.error('Error fetching classes by teacher', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/list', async (req, res) => {
    try {
        const { search, searchType } = req.query;
        let query = `
            SELECT l.id, l.subject, l.teacher,
                   IF(i.name IS NULL, "특강", i.name) AS class_name,
                   l.code, l.lecture_date
            FROM lecture l
            LEFT JOIN class_info i ON l.class_id = i.id
        `;

        const params = [];
        let whereAdded = false;

        if (search) {
            if (searchType === 'subject') {
                query += ' WHERE l.subject LIKE ?';
                params.push(`%${search}%`);
                whereAdded = true;
            } else if (searchType === 'class') {
                query += ' WHERE i.name LIKE ?';
                params.push(`%${search}%`);
                whereAdded = true;
            } else if (searchType === 'teacher') {
                query += ' WHERE l.teacher LIKE ?';
                params.push(`%${search}%`);
                whereAdded = true;
            }
        }

        query += ' ORDER BY l.id DESC LIMIT 300';
        
        const [lectures] = await db.execute(query, params);
        
        res.render('lecture/list', {
            lectures,
            search,
            searchType,
            pageTitle: '강의 관리',
            user: req.session.adminUser
        });
    } catch (error) {
        logger.error('Error loading lecture list', error);
        res.status(500).render('error', { error });
    }
});

router.get('/view/:id', async (req, res) => {
    try {
        const lectureId = req.params.id;
        
        const [lectureData] = await db.execute(
            'SELECT id, subject, description, url, teacher, lecture_date FROM lecture WHERE id = ?',
            [lectureId]
        );
        
        if (lectureData.length === 0) {
            return res.status(404).render('404');
        }
        
        const [files] = await db.execute(
            `SELECT i.id, i.filename, i.filedata 
             FROM file_info i, file_status s 
             WHERE s.lecture_id = ? AND s.file_id = i.id`,
            [lectureId]
        );
        
        const [questions] = await db.execute(
            `SELECT l.text, s.name as writer, DATE_FORMAT(l.insert_time, "%Y-%m-%d") as date 
             FROM question l, student s, user_info u 
             WHERE l.lecture_id = ? AND u.id = l.user_id AND s.id = u.student_id
             ORDER BY l.insert_time DESC`,
            [lectureId]
        );
        
        res.render('lecture/view', {
            lecture: lectureData[0],
            files,
            questions,
            pageTitle: lectureData[0].subject,
            user: req.session.adminUser
        });
    } catch (error) {
        logger.error('Error viewing lecture', error);
        res.status(500).render('error', { error });
    }
});

router.get('/edit/:id', async (req, res) => {
    try {
        const lectureId = req.params.id;
        
        const [lectureData] = await db.execute(
            'SELECT * FROM lecture WHERE id = ?',
            [lectureId]
        );
        
        if (lectureData.length === 0) {
            return res.status(404).render('404');
        }
        
        const [teachers] = await db.execute(
            'SELECT name FROM admin_user_info WHERE code = ? ORDER BY name',
            ['T']
        );
        
        const [classes] = await db.execute(
            'SELECT id, name FROM class_info WHERE liveStatus = 1 ORDER BY name'
        );
        
        const [files] = await db.execute(
            `SELECT i.id, i.filename 
             FROM file_info i, file_status s 
             WHERE s.lecture_id = ? AND s.file_id = i.id`,
            [lectureId]
        );
        
        res.render('lecture/edit', {
            lecture: lectureData[0],
            teachers,
            classes,
            files,
            pageTitle: '강의 수정',
            user: req.session.adminUser
        });
    } catch (error) {
        logger.error('Error loading lecture edit page', error);
        res.status(500).render('error', { error });
    }
});

router.post('/edit/:id', upload.array('files', 10), async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const lectureId = req.params.id;
        const { subject, description, teacher, url, lectureDate, classId, deleteFiles } = req.body;
        
        await connection.execute(
            `UPDATE lecture 
             SET subject = ?, description = ?, teacher = ?, url = ?, lecture_date = ?, class_id = ?
             WHERE id = ?`,
            [subject, description, teacher, url, lectureDate, classId, lectureId]
        );
        
        if (deleteFiles) {
            const filesToDelete = Array.isArray(deleteFiles) ? deleteFiles : [deleteFiles];
            for (const fileId of filesToDelete) {
                await connection.execute(
                    'DELETE FROM file_status WHERE lecture_id = ? AND file_id = ?',
                    [lectureId, fileId]
                );
                await connection.execute(
                    'DELETE FROM file_info WHERE id = ?',
                    [fileId]
                );
            }
        }
        
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const [fileResult] = await connection.execute(
                    'INSERT INTO file_info (filename, filedata, insert_time) VALUES (?, null, NOW())',
                    [file.filename]
                );
                
                await connection.execute(
                    'INSERT INTO file_status (lecture_id, file_id, insert_time) VALUES (?, ?, NOW())',
                    [lectureId, fileResult.insertId]
                );
            }
        }
        
        await connection.commit();
        res.redirect('/lecture/list');
        
    } catch (error) {
        await connection.rollback();
        logger.error('Error updating lecture', error);
        res.status(500).render('error', { error });
    } finally {
        connection.release();
    }
});

router.delete('/delete/:id', async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const lectureId = req.params.id;
        
        const [files] = await connection.execute(
            'SELECT file_id FROM file_status WHERE lecture_id = ?',
            [lectureId]
        );
        
        await connection.execute(
            'DELETE FROM file_status WHERE lecture_id = ?',
            [lectureId]
        );
        
        for (const file of files) {
            await connection.execute(
                'DELETE FROM file_info WHERE id = ?',
                [file.file_id]
            );
        }
        
        await connection.execute(
            'DELETE FROM question WHERE lecture_id = ?',
            [lectureId]
        );
        
        await connection.execute(
            'DELETE FROM lecture WHERE id = ?',
            [lectureId]
        );
        
        await connection.commit();
        res.json({ success: true });
        
    } catch (error) {
        await connection.rollback();
        logger.error('Error deleting lecture', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        connection.release();
    }
});

router.get('/download/:fileId', async (req, res) => {
    try {
        const fileId = req.params.fileId;
        
        const [fileData] = await db.execute(
            'SELECT filename FROM file_info WHERE id = ?',
            [fileId]
        );
        
        if (fileData.length === 0) {
            return res.status(404).render('404');
        }
        
        const filePath = path.join(uploadDir, fileData[0].filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).render('404');
        }
        
        res.download(filePath, fileData[0].filename);
    } catch (error) {
        logger.error('Error downloading file', error);
        res.status(500).render('error', { error });
    }
});

module.exports = router;