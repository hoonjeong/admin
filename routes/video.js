const express = require('express');
const router = express.Router();
const db = require('../config/database');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// 동영상 강의 목록
router.get('/', async (req, res) => {
    try {
        // 로그인 체크
        if (!req.session.userInfo) {
            // 리다이렉트 URL을 쿼리 파라미터로 저장하여 로그인 페이지로 이동
            return res.redirect('/user/login?redirect=' + encodeURIComponent('/video'));
        }

        const userInfo = req.session.userInfo;

        // user_info 테이블에서 student_id 가져오기
        const [userRows] = await db.execute(
            'SELECT id, email, student_id FROM user_info WHERE id = ?',
            [userInfo.id]
        );

        if (userRows.length === 0 || !userRows[0].student_id) {
            return res.render('video/index', {
                userInfo: userInfo,
                lectures: []
            });
        }

        const studentId = userRows[0].student_id;

        // class_status 테이블에서 status가 1인 강의 중, student_id에 해당하는 강의의 class_id와 start_time, end_time 정보 가져오기
        const [classStatusRows] = await db.execute(`
            SELECT cs.class_id, cs.start_time, cs.end_time, ci.name as class_name
            FROM class_status cs
            LEFT JOIN class_info ci ON cs.class_id = ci.id
            WHERE cs.student_id = ? AND cs.status = 1
        `, [studentId]);


        if (classStatusRows.length === 0) {
            return res.render('video/index', {
                userInfo: userInfo,
                lectures: []
            });
        }

        // 각 클래스별로 강의 조회 조건 생성
        let lectureConditions = [];
        let params = [];

        for (const classStatus of classStatusRows) {

            if (classStatus.end_time === null) {
                // end_time이 null인 경우 수강중인 상태이므로, start_time 이후 강의를 모두 가져옴
                lectureConditions.push(
                    '(l.class_id = ? AND l.insert_time >= ?)'
                );
                params.push(classStatus.class_id, classStatus.start_time);
            } else {
                // start_time 이후, end_time 이전인 강의만 가져옴
                lectureConditions.push(
                    '(l.class_id = ? AND l.insert_time >= ? AND l.insert_time <= ?)'
                );
                params.push(classStatus.class_id, classStatus.start_time, classStatus.end_time);
            }
        }

        if (lectureConditions.length === 0) {
            return res.render('video/index', {
                userInfo: userInfo,
                lectures: []
            });
        }

        // lecture 테이블에서 조건에 맞는 강의 정보와 질문 수 조회
        const lecturesQuery = `
            SELECT l.id as lecture_id, l.subject, l.lecture_date,
                   (SELECT COUNT(*) FROM question q WHERE q.lecture_id = l.id) as question_count
            FROM lecture l
            WHERE (${lectureConditions.join(' OR ')})
            AND l.url IS NOT NULL
            AND l.url != ''
            ORDER BY l.id DESC
        `;

        const [lectures] = await db.execute(lecturesQuery, params);

        res.render('video/index', {
            userInfo: userInfo,
            lectures
        });
    } catch (error) {
        logger.error('Video list error', error);
        res.status(500).send('동영상 강의 조회 중 오류가 발생했습니다.');
    }
});

// 동영상 강의 상세보기
router.get('/:id', async (req, res) => {
    try {
        // 로그인 체크
        if (!req.session.userInfo) {
            return res.redirect('/user/login?redirect=/video/' + req.params.id);
        }

        const lectureId = req.params.id;
        const userInfo = req.session.userInfo;

        // user_info 테이블에서 student_id 가져오기
        const [userRows] = await db.execute(
            'SELECT student_id FROM user_info WHERE id = ?',
            [userInfo.id]
        );

        if (userRows.length === 0 || !userRows[0].student_id) {
            return res.status(403).send('해당 강의에 접근할 권한이 없습니다.');
        }

        const studentId = userRows[0].student_id;

        // 학생이 수강중인 강의인지 확인
        const accessCheckQuery = `
            SELECT COUNT(*) as count
            FROM lecture l
            INNER JOIN class_status cs ON l.class_id = cs.class_id
            WHERE l.id = ? AND cs.student_id = ?
            AND cs.status = 1
        `;

        const [accessCheck] = await db.execute(accessCheckQuery, [lectureId, studentId]);

        if (accessCheck[0].count === 0) {
            return res.status(403).send('해당 강의에 접근할 권한이 없습니다.');
        }

        // 강의 정보 조회 (질문 수 포함)
        const [lectures] = await db.execute(`
            SELECT l.id, l.subject, l.description, l.url, l.lecture_date, l.file_id,
                   (SELECT COUNT(*) FROM question q WHERE q.lecture_id = l.id) as question_count
            FROM lecture l
            WHERE l.id = ?
        `, [lectureId]);

        if (lectures.length === 0) {
            return res.status(404).send('강의를 찾을 수 없습니다.');
        }

        const lecture = lectures[0];

        // 첨부파일 조회
        // 첨부파일 조회 (파일 ID가 있는 경우)
        let files = [];
        if (lecture.file_id) {
            const [fileResults] = await db.execute(`
                SELECT * FROM file_info WHERE id = ?
            `, [lecture.file_id]);
            files = fileResults;
        }

        // 추가로 file_status를 통해 연결된 파일들도 조회
        const [additionalFiles] = await db.execute(`
            SELECT fi.*, fs.lecture_id
            FROM file_info fi
            INNER JOIN file_status fs ON fi.id = fs.file_id
            WHERE fs.lecture_id = ?
            ORDER BY fi.filename
        `, [lectureId]);

        // 두 결과를 합침 (중복 제거)
        const allFiles = [...files, ...additionalFiles];
        const uniqueFiles = allFiles.filter((file, index, self) =>
            index === self.findIndex(f => f.id === file.id)
        );

        // 질문 목록 조회 (학생 이름과 함께)
        const [questions] = await db.execute(`
            SELECT q.text as question_content, s.name as writer,
                   DATE_FORMAT(q.insert_time, '%Y-%m-%d') as date
            FROM question q
            JOIN user_info u ON q.user_id = u.id
            JOIN student s ON u.student_id = s.id
            WHERE q.lecture_id = ?
            ORDER BY q.insert_time DESC
        `, [lectureId]);

        res.render('video/detail', {
            lecture,
            files: uniqueFiles,
            questions,
            userInfo: userInfo
        });
    } catch (error) {
        logger.error('Video detail error', error);
        res.status(500).send('강의 조회 중 오류가 발생했습니다.');
    }
});

// 파일 다운로드
router.get('/download/:fileId', async (req, res) => {
    try {
        // 로그인 체크
        if (!req.session.userInfo) {
            return res.status(401).send('로그인이 필요합니다.');
        }

        const fileId = req.params.fileId;
        const userId = req.session.userInfo.id;

        // 파일 정보 및 접근 권한 확인
        // user_info 테이블에서 student_id 가져오기
        const [userRows] = await db.execute(
            'SELECT student_id FROM user_info WHERE id = ?',
            [userId]
        );

        if (userRows.length === 0 || !userRows[0].student_id) {
            return res.status(404).send('파일을 찾을 수 없거나 접근 권한이 없습니다.');
        }

        const studentId = userRows[0].student_id;

        const [files] = await db.execute(`
            SELECT fi.*, l.class_id
            FROM file_info fi
            INNER JOIN file_status fs ON fi.id = fs.file_id
            INNER JOIN lecture l ON fs.lecture_id = l.id
            INNER JOIN class_status cs ON l.class_id = cs.class_id
            WHERE fi.id = ? AND cs.student_id = ?
            AND cs.status = 1
        `, [fileId, studentId]);

        if (files.length === 0) {
            return res.status(404).send('파일을 찾을 수 없거나 접근 권한이 없습니다.');
        }

        const file = files[0];

        // file_info 테이블에서 filedata(BLOB)를 직접 제공
        if (!file.filedata) {
            return res.status(404).send('파일 데이터가 존재하지 않습니다.');
        }

        // 파일 다운로드 (BLOB 데이터 직접 전송)
        res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.send(file.filedata);
    } catch (error) {
        logger.error('File download error', error);
        res.status(500).send('파일 다운로드 중 오류가 발생했습니다.');
    }
});

// 질문 제출
router.post('/:id/question', async (req, res) => {
    try {
        // 로그인 체크
        if (!req.session.userInfo) {
            return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
        }

        const lectureId = req.params.id;
        const { question_content } = req.body;
        const userInfo = req.session.userInfo;

        if (!question_content || question_content.trim() === '') {
            return res.status(400).json({ success: false, message: '질문 내용을 입력해주세요.' });
        }

        // user_info 테이블에서 student_id 가져오기
        const [userRows] = await db.execute(
            'SELECT student_id FROM user_info WHERE id = ?',
            [userInfo.id]
        );

        if (userRows.length === 0 || !userRows[0].student_id) {
            return res.status(403).json({ success: false, message: '질문을 등록할 권한이 없습니다.' });
        }

        const studentId = userRows[0].student_id;

        // 학생이 수강중인 강의인지 확인
        const accessCheckQuery = `
            SELECT COUNT(*) as count
            FROM lecture l
            INNER JOIN class_status cs ON l.class_id = cs.class_id
            WHERE l.id = ? AND cs.student_id = ?
            AND cs.status = 1
        `;

        const [accessCheck] = await db.execute(accessCheckQuery, [lectureId, studentId]);

        if (accessCheck[0].count === 0) {
            return res.status(403).json({ success: false, message: '해당 강의에 질문을 등록할 권한이 없습니다.' });
        }

        // 질문 등록
        await db.execute(`
            INSERT INTO question (lecture_id, user_id, text, insert_time)
            VALUES (?, ?, ?, NOW())
        `, [lectureId, userInfo.id, question_content]);

        res.json({ success: true, message: '질문이 등록되었습니다.' });
    } catch (error) {
        logger.error('Question submit error', error);
        res.status(500).json({ success: false, message: '질문 등록 중 오류가 발생했습니다.' });
    }
});

module.exports = router;