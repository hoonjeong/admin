const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { sendSMS } = require('../utils/sms');
const { initSMSTables } = require('../utils/dbInit');
const { isAdmin } = require('../middleware/auth');

// SMS 테이블 초기화 (앱 시작 시 한 번만 실행)
initSMSTables();

// 문자 발송 페이지
router.get('/send', isAdmin, async (req, res) => {
    try {
        // 학년별로 수강반 정리
        const [classRows] = await db.execute(`
            SELECT id, name 
            FROM class_info 
            WHERE liveStatus = 1
            ORDER BY name
        `);

        // 학년별로 분류
        const classifiedClasses = {
            high3: [],
            high2: [],
            high1: [],
            middle3: [],
            middle2: [],
            middle1: [],
            other: []
        };

        classRows.forEach(classItem => {
            const name = classItem.name;
            if (name.includes('고3')) {
                classifiedClasses.high3.push(classItem);
            } else if (name.includes('고2')) {
                classifiedClasses.high2.push(classItem);
            } else if (name.includes('고1')) {
                classifiedClasses.high1.push(classItem);
            } else if (name.includes('중3')) {
                classifiedClasses.middle3.push(classItem);
            } else if (name.includes('중2')) {
                classifiedClasses.middle2.push(classItem);
            } else if (name.includes('중1')) {
                classifiedClasses.middle1.push(classItem);
            } else {
                classifiedClasses.other.push(classItem);
            }
        });

        // 메모 가져오기 - 관리자용 고정 ID 사용
        const [memoRows] = await db.execute(
            'SELECT memo FROM sms_memo WHERE teacher_id = ?',
            ['admin']
        );
        const memo = memoRows.length > 0 ? memoRows[0].memo : '';

        res.render('sms/send', { 
            user: req.session.user,
            classifiedClasses: classifiedClasses,
            memo: memo
        });
    } catch (error) {
        const { handleControllerError } = require('../utils/errorHandler');
        handleControllerError(res, error, 'SMS send page error');
    }
});

// 선택한 반의 학생 목록 가져오기
router.post('/api/get-students', isAdmin, async (req, res) => {
    try {
        const { classIds } = req.body;
        
        if (!classIds || classIds.length === 0) {
            return res.json({ success: false, error: '선택된 반이 없습니다.' });
        }

        const placeholders = classIds.map(() => '?').join(',');
        const [students] = await db.execute(
            `SELECT 
                s.id,
                s.name as studentName,
                s.sphone as studentPhone,
                s.pphone as parentPhone,
                ci.name as className,
                ci.id as classId
            FROM student s
            JOIN class_status cs ON s.id = cs.student_id
            JOIN class_info ci ON cs.class_id = ci.id
            WHERE cs.class_id IN (${placeholders}) 
            AND cs.status = 1
            ORDER BY ci.name, s.name`,
            classIds
        );

        // 반별로 학생 그룹화
        const groupedStudents = {};
        students.forEach(student => {
            if (!groupedStudents[student.className]) {
                groupedStudents[student.className] = {
                    classId: student.classId,
                    className: student.className,
                    students: []
                };
            }
            groupedStudents[student.className].students.push({
                id: student.id,
                name: student.studentName,
                studentPhone: student.studentPhone,
                parentPhone: student.parentPhone
            });
        });

        res.json({ 
            success: true, 
            data: Object.values(groupedStudents)
        });
    } catch (error) {
        console.error('Get students error:', error);
        res.json({ success: false, error: error.message });
    }
});

// SMS 발송 처리
router.post('/api/send', isAdmin, async (req, res) => {
    try {
        const { recipients, message } = req.body;
        
        if (!recipients || recipients.length === 0) {
            return res.json({ success: false, error: '수신자를 선택해주세요.' });
        }
        
        if (!message || message.trim() === '') {
            return res.json({ success: false, error: '메시지를 입력해주세요.' });
        }

        let successCount = 0;
        let failCount = 0;

        // 각 수신자에게 SMS 발송
        for (const recipient of recipients) {
            try {
                await sendSMS(recipient.phone, message);
                successCount++;
            } catch (error) {
                console.error('SMS 발송 실패:', error);
                failCount++;
            }
        }

        res.json({ 
            success: true, 
            successCount: successCount,
            failCount: failCount
        });
    } catch (error) {
        console.error('SMS send error:', error);
        res.json({ success: false, error: error.message });
    }
});

// 메모 저장
router.post('/api/save-memo', isAdmin, async (req, res) => {
    try {
        const { memo } = req.body;
        // 관리자용 고정 ID 사용
        const teacherId = 'admin';

        // 기존 메모 확인
        const [existing] = await db.execute(
            'SELECT id FROM sms_memo WHERE teacher_id = ?',
            [teacherId]
        );

        if (existing.length > 0) {
            // 업데이트
            await db.execute(
                'UPDATE sms_memo SET memo = ? WHERE teacher_id = ?',
                [memo, teacherId]
            );
        } else {
            // 새로 추가
            await db.execute(
                'INSERT INTO sms_memo (teacher_id, memo) VALUES (?, ?)',
                [teacherId, memo]
            );
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Save memo error:', error);
        res.json({ success: false, error: error.message });
    }
});

// 문자 발송 히스토리 페이지
router.get('/history', isAdmin, async (req, res) => {
    try {
        const { searchType = 'all', searchKeyword = '' } = req.query;
        
        // 디버깅용 로그
        console.log('SMS History Search:', { searchType, searchKeyword });
        
        let query = `
            SELECT phone, message, result_message, send_time
            FROM sms_send_result_nine
        `;

        const params = [];

        // 검색 조건 추가
        if (searchKeyword && searchKeyword.trim()) {
            switch (searchType) {
                case 'phone':
                    query += ` WHERE phone LIKE ?`;
                    params.push(`%${searchKeyword.trim()}%`);
                    break;
                case 'message':
                    query += ` WHERE message LIKE ?`;
                    params.push(`%${searchKeyword.trim()}%`);
                    break;
                case 'all':
                default:
                    query += ` WHERE phone LIKE ? OR message LIKE ?`;
                    params.push(`%${searchKeyword.trim()}%`, `%${searchKeyword.trim()}%`);
                    break;
            }
        }

        query += ` ORDER BY id DESC LIMIT 100`;
        
        // 디버깅용 로그
        console.log('SMS History Query:', query);
        console.log('SMS History Params:', params);
        
        const [historyRows] = await db.execute(query, params);
        
        console.log('SMS History Results:', historyRows.length, 'rows');

        res.render('sms/history', { 
            user: req.session.user,
            history: historyRows,
            searchType: searchType || 'all',
            searchKeyword: searchKeyword || ''
        });
    } catch (error) {
        console.error('SMS history error:', error);
        res.status(500).render('error', { error: error });
    }
});

module.exports = router;