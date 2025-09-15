const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { sendSMS } = require('../utils/sms');
const { isTeacher } = require('../middleware/auth');

// 문자 발송 페이지
router.get('/sms', isTeacher, async (req, res) => {
    try {
        // 선생님의 담당 반 목록 가져오기
        const teacherId = req.session.user.id;
        let classes = [];
        
        if (req.session.user.code === 'O') {
            // 관리자는 모든 반 보기 (JOIN으로 최적화)
            const [classRows] = await db.execute(`
                SELECT ci.id, ci.name, COUNT(cs.id) as studentCount
                FROM class_info ci
                LEFT JOIN class_status cs ON ci.id = cs.class_id AND cs.status = 1
                WHERE ci.liveStatus = 1
                GROUP BY ci.id, ci.name
                ORDER BY ci.name
            `);

            classes = classRows;
        } else {
            // 선생님은 담당 반만 보기 (JOIN으로 최적화)
            const [classRows] = await db.execute(`
                SELECT ci.id, ci.name, COUNT(cs.id) as studentCount
                FROM class_info ci
                LEFT JOIN class_status cs ON ci.id = cs.class_id AND cs.status = 1
                WHERE ci.liveStatus = 1
                AND (ci.teacherOne = ? OR ci.teacherTwo = ?)
                GROUP BY ci.id, ci.name
                ORDER BY ci.name
            `, [req.session.user.name, req.session.user.name]);

            classes = classRows;
        }
        
        // 선생님의 메모 가져오기
        const [memoRows] = await db.execute(
            'SELECT memo FROM sms_memo WHERE teacher_id = ?',
            [teacherId]
        );
        const memo = memoRows.length > 0 ? memoRows[0].memo : '';
        
        res.render('teacher/sms', { 
            user: req.session.user,
            classes: classes,
            memo: memo
        });
    } catch (error) {
        const { handleControllerError } = require('../utils/errorHandler');
        handleControllerError(res, error, 'SMS page error');
    }
});

// 반별 학생 목록 API
router.get('/api/class-students/:classId', isTeacher, async (req, res) => {
    try {
        const classId = req.params.classId;
        
        const [students] = await db.execute(
            `SELECT s.id, s.name, s.sphone, s.pphone 
             FROM student s 
             JOIN class_status cs ON s.id = cs.student_id 
             WHERE cs.class_id = ? AND cs.status = 1
             ORDER BY s.name`,
            [classId]
        );
        
        res.json({ success: true, students: students });
    } catch (error) {
        console.error('Get students error:', error);
        res.json({ success: false, error: error.message });
    }
});

// 문자 발송 API
router.post('/api/send-sms', isTeacher, async (req, res) => {
    try {
        const { phones, message } = req.body;

        if (!phones || phones.length === 0) {
            return res.json({ success: false, error: '수신 번호를 선택해주세요.' });
        }

        if (!message || message.trim() === '') {
            return res.json({ success: false, error: '메시지를 입력해주세요.' });
        }

        const results = [];

        for (const phone of phones) {
            try {
                await sendSMS(phone, message);
                results.push({
                    phone: phone,
                    success: true,
                    message: '발송 성공'
                });
            } catch (error) {
                console.error(`SMS send error for ${phone}:`, error);
                results.push({
                    phone: phone,
                    success: false,
                    message: error.message
                });
            }
        }

        res.json({
            success: true,
            results: results,
            totalSent: results.filter(r => r.success).length,
            totalFailed: results.filter(r => !r.success).length
        });
    } catch (error) {
        console.error('SMS send error:', error);
        res.json({ success: false, error: error.message });
    }
});

// 최근 메시지 조회 API - 이름 정보 포함
router.get('/api/recent-message/:phone/:name', isTeacher, async (req, res) => {
    try {
        const phone = req.params.phone;
        const name = decodeURIComponent(req.params.name);
        
        // 해당 번호로 발송된 가장 최근 메시지 조회
        const [messages] = await db.execute(
            `SELECT message, DATE_FORMAT(send_time, '%Y-%m-%d %H:%i:%s') as send_time
             FROM sms_send_result_nine
             WHERE phone = ?
             ORDER BY send_time DESC
             LIMIT 1`,
            [phone]
        );
        
        if (messages.length > 0) {
            res.json({ 
                success: true, 
                message: messages[0].message,
                sendTime: messages[0].send_time,
                recipientName: name
            });
        } else {
            res.json({ 
                success: true, 
                message: null,
                sendTime: null,
                recipientName: name
            });
        }
    } catch (error) {
        console.error('Get recent message error:', error);
        res.json({ success: false, error: error.message });
    }
});

// 메모 저장 API
router.post('/api/save-memo', isTeacher, async (req, res) => {
    try {
        const { memo } = req.body;
        const teacherId = req.session.user.id;
        
        // 기존 메모가 있는지 확인
        const [existing] = await db.execute(
            'SELECT id FROM sms_memo WHERE teacher_id = ?',
            [teacherId]
        );
        
        if (existing.length > 0) {
            // 업데이트
            await db.execute(
                'UPDATE sms_memo SET memo = ?, update_time = NOW() WHERE teacher_id = ?',
                [memo, teacherId]
            );
        } else {
            // 신규 등록
            await db.execute(
                'INSERT INTO sms_memo (teacher_id, memo, update_time) VALUES (?, ?, NOW())',
                [teacherId, memo]
            );
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Save memo error:', error);
        res.json({ success: false, error: error.message });
    }
});

// 내 강의 목록 조회
router.get('/lectures', isTeacher, async (req, res) => {
    try {
        const teacherName = req.session.user.name;
        
        // 강의 목록 조회
        const [lectures] = await db.execute(`
            SELECT id, subject, teacher, lecture_date 
            FROM lecture 
            WHERE teacher = ? 
            ORDER BY id DESC
        `, [teacherName]);
        
        // 각 강의에 대한 질문 수와 첨부파일 수 조회
        for (let lecture of lectures) {
            // 질문 수 조회
            try {
                const [questionCount] = await db.execute(
                    'SELECT COUNT(*) as cnt FROM question WHERE lecture_id = ?',
                    [lecture.id]
                );
                lecture.questionCount = questionCount[0].cnt;
            } catch (error) {
                console.error('Error counting questions for lecture:', lecture.id, error);
                lecture.questionCount = 0;
            }
            
            // 첨부파일 수 조회
            try {
                const [fileCount] = await db.execute(
                    'SELECT COUNT(*) as cnt FROM file_status WHERE lecture_id = ?',
                    [lecture.id]
                );
                lecture.hasFile = fileCount[0].cnt > 0;
            } catch (error) {
                console.error('Error counting files for lecture:', lecture.id, error);
                lecture.hasFile = false;
            }
        }
        
        res.render('teacher/lectures', {
            user: req.session.user,
            lectures: lectures
        });
    } catch (error) {
        console.error('Lectures list error:', error);
        res.status(500).render('error', { error: error });
    }
});

// 강의 상세 조회
router.get('/lecture/:id', isTeacher, async (req, res) => {
    try {
        const lectureId = req.params.id;
        const teacherName = req.session.user.name;
        
        // 강의 정보 조회
        const [lectureInfo] = await db.execute(`
            SELECT id, subject, description, url, teacher, lecture_date 
            FROM lecture 
            WHERE id = ? AND teacher = ?
        `, [lectureId, teacherName]);
        
        if (lectureInfo.length === 0) {
            return res.redirect('/teacher/lectures');
        }
        
        // 파일 정보 조회
        let files = [];
        try {
            const [fileResults] = await db.execute(`
                SELECT i.id, i.filename, i.filedata 
                FROM file_info i, file_status s 
                WHERE s.lecture_id = ? AND s.file_id = i.id
            `, [lectureId]);
            files = fileResults;
        } catch (error) {
            console.error('Error fetching files:', error);
        }
        
        // 질문 리스트 조회
        let questions = [];
        try {
            const [questionResults] = await db.execute(`
                SELECT l.text, s.name as writer, 
                       DATE_FORMAT(l.insert_time, '%Y-%m-%d') as date 
                FROM question l, student s, user_info u 
                WHERE l.lecture_id = ? 
                AND u.id = l.user_id 
                AND s.id = u.student_id
                ORDER BY l.insert_time DESC
            `, [lectureId]);
            questions = questionResults;
        } catch (error) {
            console.error('Error fetching questions:', error);
        }
        
        res.render('teacher/lecture-detail', {
            user: req.session.user,
            lecture: lectureInfo[0],
            files: files,
            questions: questions
        });
    } catch (error) {
        console.error('Lecture detail error:', error);
        res.status(500).render('error', { error: error });
    }
});

module.exports = router;