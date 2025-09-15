const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const db = require('../config/database');

// 수강생 추가 페이지
router.get('/add', [isAuthenticated, isAdmin], async (req, res) => {
    try {
        res.render('student/add', {
            user: req.session.user
        });
    } catch (error) {
        handleError(res, error, 'Error loading student add page');
    }
});

// 수강생 추가 처리
router.post('/add', [isAuthenticated, isAdmin], async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        
        const { name, school, grade, year, sphone, pphone, address, specialty, memo } = req.body;
        
        // 학생 정보 삽입
        const [result] = await connection.execute(
            `INSERT INTO student (name, school, grade, year, sphone, pphone, address, specialty, memo, status, insert_date, modify_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
            [name, school, grade, year, sphone || null, pphone || null, address || null, specialty || null, memo || null]
        );
        
        const studentId = result.insertId;
        
        // 통계용 데이터 삽입
        await connection.execute(
            'INSERT INTO student_analysis (student_id, code, insert_time) VALUES (?, "join", NOW())',
            [studentId]
        );
        
        await connection.commit();
        res.json({ success: true, message: '수강생이 등록되었습니다.' });
    } catch (error) {
        await connection.rollback();
        handleError(res, error, 'Error adding student');
    } finally {
        connection.release();
    }
});

// 수강생 관리 페이지
router.get('/manage', [isAuthenticated, isAdmin], async (req, res) => {
    try {
        const { search, school, sort } = req.query;
        
        // 기본 쿼리 - insert_date와 modify_date 모두 조회
        let query = `SELECT id, name, school, grade, year, sphone, pphone, 
                            DATE_FORMAT(insert_date, "%Y-%m-%d") as date,
                            DATE_FORMAT(modify_date, "%Y-%m-%d") as modify_date 
                     FROM student 
                     WHERE status = 1`;
        const params = [];
        
        // 검색 조건 추가
        if (search) {
            query += ' AND (name LIKE ? OR sphone LIKE ? OR pphone LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        
        if (school && school !== 'all') {
            query += ' AND school = ?';
            params.push(school);
        }
        
        // 정렬 옵션
        if (sort === 'join_date_desc') {
            query += ' ORDER BY insert_date DESC';
        } else if (sort === 'join_date_asc') {
            query += ' ORDER BY insert_date ASC';
        } else if (sort === 'name_desc') {
            query += ' ORDER BY name DESC';
        } else {
            query += ' ORDER BY name ASC';
        }
        
        let students = [];
        let schools = [];
        
        try {
            const [studentResults] = await db.execute(query, params);
            students = studentResults;
            
            // 학교 목록 조회 (필터용)
            const [schoolResults] = await db.execute(
                'SELECT DISTINCT school FROM student WHERE status = 1 AND school IS NOT NULL AND school != "" ORDER BY school ASC'
            );
            schools = schoolResults;
        } catch (dbError) {
            console.error('Database query error:', dbError);
            // 데이터베이스 오류 시에도 빈 배열로 페이지 렌더링
        }
        
        res.render('student/manage', {
            user: req.session.user,
            students: students,
            schools: schools,
            search: search || '',
            selectedSchool: school || 'all',
            selectedSort: sort || 'name_asc'
        });
    } catch (error) {
        handleError(res, error, 'Error loading student manage page');
        // 오류 발생 시 기본값으로 페이지 렌더링
        res.render('student/manage', {
            user: req.session.user,
            students: [],
            schools: [],
            search: '',
            selectedSchool: 'all',
            selectedSort: 'name_asc'
        });
    }
});

// 퇴원생 관리 페이지
router.get('/exited', [isAuthenticated, isAdmin], async (req, res) => {
    try {
        const { search, school, sort } = req.query;
        
        // 기본 쿼리 - modify_date를 퇴원일로 추가
        let query = `SELECT id, name, school, grade, year, sphone, pphone, 
                            DATE_FORMAT(insert_date, "%Y-%m-%d") as date,
                            DATE_FORMAT(modify_date, "%Y-%m-%d") as exit_date 
                     FROM student 
                     WHERE status = 0`;
        const params = [];
        
        // 검색 조건 추가
        if (search) {
            query += ' AND (name LIKE ? OR sphone LIKE ? OR pphone LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        
        if (school && school !== 'all') {
            query += ' AND school = ?';
            params.push(school);
        }
        
        // 정렬 옵션
        if (sort === 'exit_date_desc') {
            query += ' ORDER BY modify_date DESC';
        } else if (sort === 'exit_date_asc') {
            query += ' ORDER BY modify_date ASC';
        } else if (sort === 'name_desc') {
            query += ' ORDER BY name DESC';
        } else {
            query += ' ORDER BY name ASC';
        }
        
        const [students] = await db.execute(query, params);
        
        // 학교 목록 조회 (필터용)
        const [schools] = await db.execute(
            'SELECT DISTINCT school FROM student WHERE status = 0 AND school IS NOT NULL AND school != "" ORDER BY school ASC'
        );
        
        res.render('student/exited', {
            user: req.session.user,
            students: students,
            schools: schools,
            search: search || '',
            selectedSchool: school || 'all',
            selectedSort: sort || 'name_asc'
        });
    } catch (error) {
        handleError(res, error, 'Error loading exited students page');
        res.render('student/exited', {
            user: req.session.user,
            students: [],
            schools: [],
            search: '',
            selectedSchool: 'all',
            selectedSort: 'name_asc'
        });
    }
});

// 학생 퇴원 처리
router.post('/:id/exit', [isAuthenticated, isAdmin], async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        
        const studentId = req.params.id;
        
        // 수강 상태 종료
        await connection.execute(
            'UPDATE class_status SET end_time = NOW(), status = 0 WHERE student_id = ?',
            [studentId]
        );
        
        // 학생 상태 변경
        await connection.execute(
            'UPDATE student SET status = 0, modify_date = NOW() WHERE id = ?',
            [studentId]
        );
        
        // 사용자 정보 업데이트 (필요한 경우)
        await connection.execute(
            'UPDATE user_info SET code = "D" WHERE student_id = ?',
            [studentId]
        );
        
        // 통계 데이터 삽입
        await connection.execute(
            'INSERT INTO student_analysis (student_id, code, insert_time) VALUES (?, "EXIT", NOW())',
            [studentId]
        );
        
        await connection.commit();
        res.json({ success: true, message: '퇴원 처리되었습니다.' });
    } catch (error) {
        await connection.rollback();
        handleError(res, error, 'Error exiting student');
    } finally {
        connection.release();
    }
});

// 학생 재원 처리
router.post('/:id/rejoin', [isAuthenticated, isAdmin], async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        
        const studentId = req.params.id;
        
        // 학생 상태 변경
        await connection.execute(
            'UPDATE student SET status = 1, modify_date = NOW() WHERE id = ?',
            [studentId]
        );
        
        // 사용자 정보 업데이트 (필요한 경우)
        await connection.execute(
            'UPDATE user_info SET code = "S" WHERE student_id = ?',
            [studentId]
        );
        
        // 통계 데이터 삽입
        await connection.execute(
            'INSERT INTO student_analysis (student_id, code, insert_time) VALUES (?, "rejoin", NOW())',
            [studentId]
        );
        
        await connection.commit();
        res.json({ success: true, message: '재원 처리되었습니다.' });
    } catch (error) {
        await connection.rollback();
        handleError(res, error, 'Error rejoining student');
    } finally {
        connection.release();
    }
});

// 수강 관리 페이지
router.get('/:id/courses', [isAuthenticated, isAdmin], async (req, res) => {
    try {
        const studentId = req.params.id;
        
        // 학생 정보 조회
        const [studentInfo] = await db.execute(
            'SELECT * FROM student WHERE id = ?',
            [studentId]
        );
        
        if (studentInfo.length === 0) {
            return res.status(404).render('error', { error: '학생을 찾을 수 없습니다.' });
        }
        
        // 진행중인 수강반 목록 (자동완성용)
        const [classes] = await db.execute(
            'SELECT id, name FROM class_info WHERE liveStatus = 1 ORDER BY name ASC'
        );
        
        // 학생의 수강 정보 조회
        const [courses] = await db.execute(
            `SELECT cs.id, cs.student_id, cs.class_id, ci.name as class_name, cs.status, 
                    DATE_FORMAT(cs.start_time, "%Y-%m-%d") as start_time, 
                    DATE_FORMAT(cs.end_time, "%Y-%m-%d") as end_time 
             FROM class_status cs
             JOIN class_info ci ON cs.class_id = ci.id
             WHERE cs.student_id = ?
             ORDER BY cs.status DESC, cs.class_id DESC`,
            [studentId]
        );
        
        res.render('student/courses', {
            user: req.session.user,
            student: studentInfo[0],
            classes: classes,
            courses: courses
        });
    } catch (error) {
        handleError(res, error, 'Error loading courses page');
    }
});

// 수강반 등록
router.post('/:studentId/courses/add', [isAuthenticated, isAdmin], async (req, res) => {
    try {
        const { studentId } = req.params;
        const { classId, startTime } = req.body;
        
        // 중복 등록 체크
        const [existing] = await db.execute(
            'SELECT id FROM class_status WHERE student_id = ? AND class_id = ? AND status = 1',
            [studentId, classId]
        );
        
        if (existing.length > 0) {
            return res.json({ success: false, error: '이미 해당 수강반에 등록되어 있습니다.' });
        }
        
        await db.execute(
            'INSERT INTO class_status (class_id, student_id, start_time, status) VALUES (?, ?, ?, 1)',
            [classId, studentId, startTime]
        );
        
        res.json({ success: true, message: '수강반이 등록되었습니다.' });
    } catch (error) {
        handleError(res, error, 'Error adding course');
    }
});

// 수강 상태 변경 (종강/재시작)
router.post('/courses/:id/toggle', [isAuthenticated, isAdmin], async (req, res) => {
    try {
        const courseId = req.params.id;
        
        // 현재 상태 조회
        const [course] = await db.execute(
            'SELECT status FROM class_status WHERE id = ?',
            [courseId]
        );
        
        if (course.length === 0) {
            return res.json({ success: false, error: '수강 정보를 찾을 수 없습니다.' });
        }
        
        const currentStatus = course[0].status;
        
        if (currentStatus === 1) {
            // 종강 처리
            await db.execute(
                'UPDATE class_status SET status = 0, end_time = NOW() WHERE id = ?',
                [courseId]
            );
            res.json({ success: true, message: '종강 처리되었습니다.' });
        } else {
            // 재시작 처리
            await db.execute(
                'UPDATE class_status SET status = 1, end_time = NULL WHERE id = ?',
                [courseId]
            );
            res.json({ success: true, message: '수강이 재시작되었습니다.' });
        }
    } catch (error) {
        handleError(res, error, 'Error toggling course status');
    }
});

// 학생 정보 수정 페이지
router.get('/:id/edit', [isAuthenticated, isAdmin], async (req, res) => {
    try {
        const studentId = req.params.id;
        
        const [student] = await db.execute(
            'SELECT * FROM student WHERE id = ?',
            [studentId]
        );
        
        if (student.length === 0) {
            return res.status(404).render('error', { error: '학생을 찾을 수 없습니다.' });
        }
        
        res.render('student/edit', {
            user: req.session.user,
            student: student[0]
        });
    } catch (error) {
        handleError(res, error, 'Error loading student edit page');
    }
});

// 학생 정보 수정 처리
router.put('/:id', [isAuthenticated, isAdmin], async (req, res) => {
    try {
        const studentId = req.params.id;
        const { name, school, grade, year, sphone, pphone, address, specialty, memo } = req.body;
        
        await db.execute(
            `UPDATE student 
             SET name = ?, school = ?, grade = ?, year = ?, sphone = ?, pphone = ?, 
                 address = ?, specialty = ?, memo = ?, modify_date = NOW()
             WHERE id = ?`,
            [name, school, grade, year, sphone || null, pphone || null, 
             address || null, specialty || null, memo || null, studentId]
        );
        
        res.json({ success: true, message: '학생 정보가 수정되었습니다.' });
    } catch (error) {
        handleError(res, error, 'Error updating student');
    }
});

module.exports = router;