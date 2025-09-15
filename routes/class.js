const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const db = require('../config/database');

// 수강반 추가 페이지
router.get('/add', [isAuthenticated, isAdmin], async (req, res) => {
    try {
        // 선생님 목록 조회 (code가 'T'인 사용자)
        const [teachers] = await db.execute(
            'SELECT name FROM admin_user_info WHERE code = ? ORDER BY name ASC',
            ['T']
        );
        
        res.render('class/add', {
            user: req.session.user,
            teachers: teachers
        });
    } catch (error) {
        handleError(res, error, 'Error loading class add page');
    }
});

// 수강반 추가 처리
router.post('/add', [isAuthenticated, isAdmin], async (req, res) => {
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
        handleError(res, error, 'Error adding class');
    }
});

// 수강반 수정 페이지 (목록)
router.get('/edit', [isAuthenticated, isAdmin], async (req, res) => {
    try {
        const { search, teacher, status = 'active' } = req.query;
        
        // 선생님 목록 조회
        const [teachers] = await db.execute(
            'SELECT name FROM admin_user_info WHERE code = ? ORDER BY name ASC',
            ['T']
        );
        
        // 수강반 목록 조회 쿼리 생성
        let query = `SELECT id, name, grade, year, day, hour, minute, teacherOne, teacherTwo, liveStatus 
                     FROM class_info WHERE 1=1`;
        const params = [];
        
        // 검색 조건 추가
        if (search) {
            query += ' AND name LIKE ?';
            params.push(`%${search}%`);
        }
        
        if (teacher) {
            query += ' AND (teacherOne = ? OR teacherTwo = ?)';
            params.push(teacher, teacher);
        }
        
        // 상태 필터 - 기본값은 'active' (진행중)
        if (status === 'active') {
            query += ' AND liveStatus = 1';
        } else if (status === 'inactive') {
            query += ' AND liveStatus = 0';
        }
        // 'all'인 경우 WHERE 조건 추가 안함
        
        query += ' ORDER BY name ASC';
        
        const [classes] = await db.execute(query, params);
        
        res.render('class/edit', {
            user: req.session.user,
            classes: classes,
            teachers: teachers,
            search: search || '',
            selectedTeacher: teacher || '',
            selectedStatus: status
        });
    } catch (error) {
        handleError(res, error, 'Error loading class edit page');
    }
});

// 수강반 정보 조회 (수정용)
router.get('/:id', [isAuthenticated, isAdmin], async (req, res) => {
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
        handleError(res, error, 'Error fetching class info');
    }
});

// 수강반 수정 처리
router.put('/:id', [isAuthenticated, isAdmin], async (req, res) => {
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
        handleError(res, error, 'Error updating class');
    }
});

// 수강반 상태 변경 (시작/종료)
router.post('/:id/toggle-status', [isAuthenticated, isAdmin], async (req, res) => {
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
        handleError(res, error, 'Error toggling class status');
    }
});

module.exports = router;