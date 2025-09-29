const express = require('express');
const router = express.Router();
const { isAdminAuthenticated, isAdmin } = require('../middleware/adminAuth');
const { asyncHandler } = require('../utils/asyncHandler');
const db = require('../config/database');
const logger = require('../utils/logger');

// 수강반 추가 페이지
router.get('/add', [isAdminAuthenticated, isAdmin], async (req, res) => {
    try {
        // 선생님 목록 조회 (code가 'T'인 사용자)
        const [teachers] = await db.execute(
            'SELECT name FROM admin_user_info WHERE code = ? ORDER BY name ASC',
            ['T']
        );
        
        res.render('class/add', {
            user: req.session.adminUser,
            teachers: teachers
        });
    } catch (error) {
        logger.error('Error loading class add page', error);
        res.status(500).render('error', { error });
    }
});

// 수강반 추가 처리
router.post('/add', [isAdminAuthenticated, isAdmin], async (req, res) => {
    try {
        const { name, school, grade, day, hour, minute, teacherOne, teacherTwo } = req.body;
        
        // 학년에 따른 year 값 설정 (현재 연도 기준)
        const currentYear = new Date().getFullYear();
        
        await db.execute(
            `INSERT INTO class_info (name, subject, grade, year, day, hour, minute, teacherOne, teacherTwo, code, price, limitCount, liveStatus)
             VALUES (?, '국어', ?, ?, ?, ?, ?, ?, ?, 'S', 270000, 30, 1)`,
            [name, grade, currentYear, day, hour, minute, teacherOne, teacherTwo]
        );
        
        res.json({ success: true, message: '수강반이 추가되었습니다.' });
    } catch (error) {
        logger.error('Error adding class', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 수강반 수정 페이지 (목록)
router.get('/edit', [isAdminAuthenticated, isAdmin], async (req, res) => {
    try {
        const { search, teacher, status = 'active' } = req.query;
        
        // 선생님 목록 조회
        const [teachers] = await db.execute(
            'SELECT name FROM admin_user_info WHERE code = ? ORDER BY name ASC',
            ['T']
        );
        
        // 수강반 목록 조회 쿼리 생성 (학생 수 포함)
        let query = `SELECT ci.id, ci.name, ci.grade, ci.year, ci.day, ci.hour, ci.minute,
                            ci.teacherOne, ci.teacherTwo, ci.liveStatus,
                            COUNT(cs.student_id) as studentCount
                     FROM class_info ci
                     LEFT JOIN class_status cs ON ci.id = cs.class_id AND cs.status = 1
                     WHERE 1=1`;
        const params = [];
        
        // 검색 조건 추가
        if (search) {
            query += ' AND ci.name LIKE ?';
            params.push(`%${search}%`);
        }

        if (teacher) {
            query += ' AND (ci.teacherOne = ? OR ci.teacherTwo = ?)';
            params.push(teacher, teacher);
        }

        // 상태 필터 - 기본값은 'active' (진행중)
        if (status === 'active') {
            query += ' AND ci.liveStatus = 1';
        } else if (status === 'inactive') {
            query += ' AND ci.liveStatus = 0';
        }
        // 'all'인 경우 WHERE 조건 추가 안함

        query += ' GROUP BY ci.id, ci.name, ci.grade, ci.year, ci.day, ci.hour, ci.minute, ci.teacherOne, ci.teacherTwo, ci.liveStatus';
        query += ' ORDER BY ci.name ASC';
        
        const [classes] = await db.execute(query, params);
        
        res.render('class/edit', {
            user: req.session.adminUser,
            classes: classes,
            teachers: teachers,
            search: search || '',
            selectedTeacher: teacher || '',
            selectedStatus: status
        });
    } catch (error) {
        logger.error('Error loading class edit page', error);
        res.status(500).render('error', { error });
    }
});

// 선생님 관리 페이지 (관리자만 접근) - /:id 보다 먼저 배치
router.get('/teachers', [isAdminAuthenticated, isAdmin], async (req, res) => {
    try {
        const [teachers] = await db.execute(
            'SELECT id, name, email, phone, insert_time FROM admin_user_info WHERE code = ? ORDER BY name ASC',
            ['T']
        );

        res.render('class/teachers', {
            user: req.session.adminUser,
            teachers: teachers
        });
    } catch (error) {
        logger.error('Error loading teachers page', error);
        res.status(500).render('error', { error });
    }
});

// 선생님 추가
router.post('/teachers', [isAdminAuthenticated, isAdmin], async (req, res) => {
    try {
        const { name, phone } = req.body;

        if (!name || !phone) {
            return res.json({ success: false, error: '이름과 전화번호를 입력해주세요.' });
        }

        // 중복 체크
        const [existing] = await db.execute(
            'SELECT id FROM admin_user_info WHERE name = ? AND phone = ?',
            [name, phone]
        );

        if (existing.length > 0) {
            return res.json({ success: false, error: '이미 등록된 선생님입니다.' });
        }

        await db.execute(
            'INSERT INTO admin_user_info (name, phone, code, insert_time) VALUES (?, ?, ?, NOW())',
            [name, phone, 'T']
        );

        res.json({ success: true, message: '선생님이 추가되었습니다.' });
    } catch (error) {
        logger.error('Error adding teacher', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 선생님 정보 조회 (수정용)
router.get('/teachers/:id', [isAdminAuthenticated, isAdmin], async (req, res) => {
    try {
        const teacherId = req.params.id;

        const [teacher] = await db.execute(
            'SELECT id, name, email, phone FROM admin_user_info WHERE id = ? AND code = ?',
            [teacherId, 'T']
        );

        if (teacher.length === 0) {
            return res.json({ success: false, error: '선생님을 찾을 수 없습니다.' });
        }

        res.json({ success: true, teacher: teacher[0] });
    } catch (error) {
        logger.error('Error fetching teacher info', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 선생님 정보 수정
router.put('/teachers/:id', [isAdminAuthenticated, isAdmin], async (req, res) => {
    try {
        const teacherId = req.params.id;
        const { name, email, phone } = req.body;

        if (!name || !phone) {
            return res.json({ success: false, error: '이름과 전화번호를 입력해주세요.' });
        }

        // 다른 선생님과 중복 체크
        const [existing] = await db.execute(
            'SELECT id FROM admin_user_info WHERE name = ? AND phone = ? AND id != ?',
            [name, phone, teacherId]
        );

        if (existing.length > 0) {
            return res.json({ success: false, error: '이미 존재하는 이름과 전화번호입니다.' });
        }

        await db.execute(
            'UPDATE admin_user_info SET name = ?, email = ?, phone = ? WHERE id = ? AND code = ?',
            [name, email || null, phone, teacherId, 'T']
        );

        res.json({ success: true, message: '선생님 정보가 수정되었습니다.' });
    } catch (error) {
        logger.error('Error updating teacher', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 선생님 삭제
router.delete('/teachers/:id', [isAdminAuthenticated, isAdmin], async (req, res) => {
    try {
        const teacherId = req.params.id;

        // 선생님 이름 조회
        const [teacher] = await db.execute(
            'SELECT name FROM admin_user_info WHERE id = ? AND code = ?',
            [teacherId, 'T']
        );

        if (teacher.length === 0) {
            return res.json({ success: false, error: '선생님을 찾을 수 없습니다.' });
        }

        // 수강반에서 해당 선생님이 사용되고 있는지 확인
        const [classes] = await db.execute(
            'SELECT COUNT(*) as cnt FROM class_info WHERE (teacherOne = ? OR teacherTwo = ?) AND liveStatus = 1',
            [teacher[0].name, teacher[0].name]
        );

        if (classes[0].cnt > 0) {
            return res.json({
                success: false,
                error: `해당 선생님은 현재 ${classes[0].cnt}개의 수강반에서 활동 중입니다. 수강반을 먼저 정리해주세요.`
            });
        }

        await db.execute(
            'DELETE FROM admin_user_info WHERE id = ? AND code = ?',
            [teacherId, 'T']
        );

        res.json({ success: true, message: `${teacher[0].name} 선생님이 삭제되었습니다.` });
    } catch (error) {
        logger.error('Error deleting teacher', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 수강반 정보 조회 (수정용) - 구체적인 경로들 이후에 배치
router.get('/:id', [isAdminAuthenticated, isAdmin], async (req, res) => {
    try {
        const classId = req.params.id;

        const [classInfo] = await db.execute(
            'SELECT * FROM class_info WHERE id = ?',
            [classId]
        );

        if (classInfo.length === 0) {
            return res.json({ success: false, error: '수강반을 찾을 수 없습니다.' });
        }

        const [teachers] = await db.execute(
            'SELECT name FROM admin_user_info WHERE code = ? ORDER BY name ASC',
            ['T']
        );

        res.json({
            success: true,
            classInfo: classInfo[0],
            teachers: teachers
        });
    } catch (error) {
        logger.error('Error fetching class info', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 수강반 수정 처리
router.put('/:id', [isAdminAuthenticated, isAdmin], async (req, res) => {
    try {
        const classId = req.params.id;
        const { name, grade, year, day, hour, minute, teacherOne, teacherTwo } = req.body;
        
        await db.execute(
            `UPDATE class_info 
             SET name = ?, grade = ?, year = ?, day = ?, hour = ?, minute = ?, 
                 teacherOne = ?, teacherTwo = ?
             WHERE id = ?`,
            [name, grade, year, day, hour, minute, teacherOne, teacherTwo, classId]
        );
        
        res.json({ success: true, message: '수강반이 수정되었습니다.' });
    } catch (error) {
        logger.error('Error updating class', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 수강반 상태 변경 (시작/종료)
router.post('/:id/toggle-status', [isAdminAuthenticated, isAdmin], async (req, res) => {
    try {
        const classId = req.params.id;
        
        // 현재 상태 조회
        const [classInfo] = await db.execute(
            'SELECT liveStatus FROM class_info WHERE id = ?',
            [classId]
        );
        
        if (classInfo.length === 0) {
            return res.json({ success: false, error: '수강반을 찾을 수 없습니다.' });
        }
        
        const currentStatus = classInfo[0].liveStatus;
        const newStatus = currentStatus === 1 ? 0 : 1;
        
        // 종료하려는 경우 수강중인 학생 확인
        if (newStatus === 0) {
            const [students] = await db.execute(
                'SELECT COUNT(*) as cnt FROM class_status WHERE class_id = ? AND status = 1',
                [classId]
            );
            
            if (students[0].cnt > 0) {
                return res.json({ 
                    success: false, 
                    error: `아직 수강중인 학생이 ${students[0].cnt}명 있습니다. 해당 학생들을 종강처리 해주세요.` 
                });
            }
        }
        
        // 상태 업데이트
        await db.execute(
            'UPDATE class_info SET liveStatus = ? WHERE id = ?',
            [newStatus, classId]
        );
        
        res.json({ 
            success: true, 
            message: newStatus === 1 ? '수강반이 시작되었습니다.' : '수강반이 종료되었습니다.' 
        });
    } catch (error) {
        logger.error('Error toggling class status', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 수강반 학생 목록 조회
router.get('/students/:classId', async (req, res) => {
    try {
        const { classId } = req.params;

        // 수강반 정보 조회
        const [classInfo] = await db.execute(
            'SELECT * FROM class_info WHERE id = ?',
            [classId]
        );

        if (classInfo.length === 0) {
            return res.status(404).render('error', {
                error: '해당 수강반을 찾을 수 없습니다.'
            });
        }

        // 수강반 학생 목록 조회 (class_status에서 활성 상태인 학생들)
        const [students] = await db.execute(`
            SELECT
                s.id,
                s.name,
                s.school,
                s.grade,
                s.year,
                s.sphone,
                s.pphone,
                cs.start_time as enrollment_date
            FROM class_status cs
            INNER JOIN student s ON cs.student_id = s.id
            WHERE cs.class_id = ? AND cs.status = 1
            ORDER BY s.name
        `, [classId]);

        res.render('class/students', {
            classInfo: classInfo[0],
            students,
            pageTitle: `${classInfo[0].name} 수강생 관리`,
            user: req.session.adminUser
        });
    } catch (error) {
        logger.error('Error loading class students', error);
        res.status(500).render('error', { error });
    }
});

// 학생 종강 처리
router.post('/students/:classId/graduate/:studentId', async (req, res) => {
    try {
        const { classId, studentId } = req.params;

        // class_status에서 해당 학생의 상태를 0으로 변경하고 end_time 업데이트
        await db.execute(
            'UPDATE class_status SET status = ?, end_time = NOW() WHERE class_id = ? AND student_id = ? AND status = ?',
            [0, classId, studentId, 1]
        );

        res.json({ success: true, message: '학생이 종강 처리되었습니다.' });
    } catch (error) {
        logger.error('Error graduating student', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;