const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { sendSMS } = require('../utils/sms');
const { isTeacher } = require('../middleware/adminAuth');
const { handleControllerError } = require('../utils/errorHandler');
const logger = require('../utils/logger');

router.get('/sms', isTeacher, async (req, res) => {
    try {
        const teacherId = req.session.adminUser.id;
        let classes = [];
        
        if (req.session.adminUser.code === 'O') {
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
            // 선생님은 담당 반만 보기 - 더 유연한 검색 방식 적용
            const teacherName = req.session.adminUser.name;


            // 선생님 이름을 포함하는 클래스를 찾기 (LIKE 사용으로 더 유연하게)
            const [classRows] = await db.execute(`
                SELECT ci.id, ci.name, COUNT(cs.id) as studentCount
                FROM class_info ci
                LEFT JOIN class_status cs ON ci.id = cs.class_id AND cs.status = 1
                WHERE ci.liveStatus = 1
                AND (ci.teacherOne LIKE ? OR ci.teacherTwo LIKE ?
                     OR ci.teacherOne = ? OR ci.teacherTwo = ?)
                GROUP BY ci.id, ci.name
                ORDER BY ci.name
            `, [`%${teacherName}%`, `%${teacherName}%`, teacherName, teacherName]);


            // 클래스가 없으면 빈 배열이지만 에러는 아님
            classes = classRows;
        }
        
        // 선생님의 메모 가져오기
        const [memoRows] = await db.execute(
            'SELECT memo FROM sms_memo WHERE teacher_id = ?',
            [teacherId]
        );
        const memo = memoRows.length > 0 ? memoRows[0].memo : '';
        
        res.render('teacher/sms', { 
            user: req.session.adminUser,
            classes: classes,
            memo: memo
        });
    } catch (error) {
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
        logger.error('Get students error', error);
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
                logger.error(`SMS send error for ${phone}`, error);
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
        logger.error('SMS send error', error);
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
        logger.error('Get recent message error', error);
        res.json({ success: false, error: error.message });
    }
});

// 메모 저장 API
router.post('/api/save-memo', isTeacher, async (req, res) => {
    try {
        const { memo } = req.body;
        const teacherId = req.session.adminUser.id;
        
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
        logger.error('Save memo error', error);
        res.json({ success: false, error: error.message });
    }
});

// 내 강의 목록 조회
router.get('/lectures', isTeacher, async (req, res) => {
    try {
        const teacherName = req.session.adminUser.name;
        
        // 강의 목록 조회 - class_status 조건 추가
        const [lectures] = await db.execute(`
            SELECT l.id, l.subject, l.teacher, l.lecture_date
            FROM lecture l
            WHERE l.teacher = ?
            AND EXISTS (
                SELECT 1 FROM class_status cs
                WHERE cs.class_id = l.class_id
                AND cs.status = 1
                AND cs.start_time <= l.lecture_date
                AND (cs.end_time IS NULL OR cs.end_time >= l.lecture_date)
            )
            ORDER BY l.id DESC
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
                logger.error('Error counting questions for lecture', { lectureId: lecture.id, error });
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
                logger.error('Error counting files for lecture', { lectureId: lecture.id, error });
                lecture.hasFile = false;
            }
        }
        
        res.render('teacher/lectures', {
            user: req.session.adminUser,
            lectures: lectures
        });
    } catch (error) {
        logger.error('Lectures list error', error);
        res.status(500).render('error', { error: error });
    }
});

// 강의 상세 조회
router.get('/lecture/:id', isTeacher, async (req, res) => {
    try {
        const lectureId = req.params.id;
        const teacherName = req.session.adminUser.name;
        
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
            logger.error('Error fetching files', error);
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
            logger.error('Error fetching questions', error);
        }
        
        res.render('teacher/lecture-detail', {
            user: req.session.adminUser,
            lecture: lectureInfo[0],
            files: files,
            questions: questions
        });
    } catch (error) {
        logger.error('Lecture detail error', error);
        res.status(500).render('error', { error: error });
    }
});

// 내정보 조회 페이지
router.get('/profile', isTeacher, async (req, res) => {
    try {
        const teacherId = req.session.adminUser.id;

        // 선생님 정보 조회
        const [teachers] = await db.execute(
            'SELECT id, email, name, phone FROM admin_user_info WHERE id = ?',
            [teacherId]
        );

        if (teachers.length === 0) {
            return res.status(404).send('사용자 정보를 찾을 수 없습니다.');
        }

        const teacher = teachers[0];

        res.render('teacher/profile', {
            title: '내정보 - 이든배움국어학원',
            teacher: teacher,
            adminUser: req.session.adminUser,
            user: req.session.adminUser, // navbar에서 사용
            error: req.query.error || null,
            success: req.query.success || null
        });

    } catch (error) {
        logger.error('Teacher profile view error', error);
        res.status(500).send('내정보 조회 중 오류가 발생했습니다.');
    }
});

// 내정보 수정 페이지
router.get('/profile/edit', isTeacher, async (req, res) => {
    try {
        const teacherId = req.session.adminUser.id;

        // 선생님 정보 조회
        const [teachers] = await db.execute(
            'SELECT id, email, name, phone FROM admin_user_info WHERE id = ?',
            [teacherId]
        );

        if (teachers.length === 0) {
            return res.status(404).send('사용자 정보를 찾을 수 없습니다.');
        }

        const teacher = teachers[0];

        res.render('teacher/profile-edit', {
            title: '내정보 수정 - 이든배움국어학원',
            teacher: teacher,
            adminUser: req.session.adminUser,
            user: req.session.adminUser, // navbar에서 사용
            error: req.query.error || null,
            success: req.query.success || null
        });

    } catch (error) {
        logger.error('Teacher profile edit view error', error);
        res.status(500).send('내정보 수정 페이지 로드 중 오류가 발생했습니다.');
    }
});

// 내정보 수정 처리
router.post('/profile/edit', isTeacher, async (req, res) => {
    try {
        const teacherId = req.session.adminUser.id;
        const { email, phone, currentPassword, newPassword, confirmPassword } = req.body;

        // 필수 입력값 확인
        if (!email || !phone) {
            return res.redirect('/teacher/profile/edit?error=' + encodeURIComponent('이메일과 전화번호는 필수입니다.'));
        }

        // 이메일 중복 확인 (본인 제외)
        const [existingEmail] = await db.execute(
            'SELECT id FROM admin_user_info WHERE email = ? AND id != ?',
            [email, teacherId]
        );

        if (existingEmail.length > 0) {
            return res.redirect('/teacher/profile/edit?error=' + encodeURIComponent('이미 사용 중인 이메일입니다.'));
        }

        // 비밀번호 변경 처리
        let updateQuery = 'UPDATE admin_user_info SET email = ?, phone = ? WHERE id = ?';
        let updateParams = [email, phone, teacherId];

        if (newPassword) {
            // 비밀번호 변경 시 현재 비밀번호 확인
            if (!currentPassword) {
                return res.redirect('/teacher/profile/edit?error=' + encodeURIComponent('현재 비밀번호를 입력해주세요.'));
            }

            if (newPassword !== confirmPassword) {
                return res.redirect('/teacher/profile/edit?error=' + encodeURIComponent('새 비밀번호가 일치하지 않습니다.'));
            }

            if (newPassword.length < 6) {
                return res.redirect('/teacher/profile/edit?error=' + encodeURIComponent('비밀번호는 6자리 이상이어야 합니다.'));
            }

            // 현재 비밀번호 확인
            const hashedCurrentPassword = crypto.createHash('sha1').update(currentPassword).digest('hex');
            const [currentUser] = await db.execute(
                'SELECT id FROM admin_user_info WHERE id = ? AND pw = ?',
                [teacherId, hashedCurrentPassword]
            );

            if (currentUser.length === 0) {
                return res.redirect('/teacher/profile/edit?error=' + encodeURIComponent('현재 비밀번호가 일치하지 않습니다.'));
            }

            // 새 비밀번호 해시화
            const hashedNewPassword = crypto.createHash('sha1').update(newPassword).digest('hex');
            updateQuery = 'UPDATE admin_user_info SET email = ?, phone = ?, pw = ? WHERE id = ?';
            updateParams = [email, phone, hashedNewPassword, teacherId];
        }

        // 정보 업데이트
        await db.execute(updateQuery, updateParams);

        // 세션 정보 업데이트
        req.session.adminUser.email = email;
        req.session.adminUser.phone = phone;

        res.redirect('/teacher/profile?success=' + encodeURIComponent('정보가 성공적으로 수정되었습니다.'));

    } catch (error) {
        logger.error('Teacher profile update error', error);
        res.redirect('/teacher/profile/edit?error=' + encodeURIComponent('정보 수정 중 오류가 발생했습니다.'));
    }
});

module.exports = router;