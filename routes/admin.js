const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { getClassesWithStudentCount } = require('../utils/database');
const db = require('../config/database');

router.use(isAuthenticated);

router.get('/dashboard', asyncHandler(async (req, res) => {
        const user = req.session.user;
        const sortBy = req.query.sort || 'name'; // 'name' or 'count'
        let classes = [];
        let newStudents = [];
        
        if (user.code === 'T') {
            const classRows = await getClassesWithStudentCount(
                db,
                'WHERE ci.liveStatus = 1 AND (ci.teacherOne = ? OR ci.teacherTwo = ?)',
                [user.name, user.name]
            );
            
            // 정렬 적용
            if (sortBy === 'count') {
                classRows.sort((a, b) => b.studentCount - a.studentCount);
            } else {
                classRows.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
            }
            
            classes = classRows;
            
            const [studentRows] = await db.execute(`
                SELECT s.id, s.name, s.sphone, s.pphone, 
                       DATE_FORMAT(s.insert_date, "%Y.%m.%d") as insert_date
                FROM class_status cs, student s, class_info ci
                WHERE (ci.teacherOne = ? OR ci.teacherTwo = ?)
                AND cs.class_id = ci.id 
                AND s.id = cs.student_id 
                AND DATE_FORMAT(s.insert_date, "%Y%m") = DATE_FORMAT(NOW(), "%Y%m")
                ORDER BY s.name ASC
            `, [user.name, user.name]);
            newStudents = studentRows;
            
        } else if (user.code === 'O') {
            const classRows = await getClassesWithStudentCount(
                db,
                'WHERE ci.liveStatus = 1',
                []
            );
            
            // 정렬 적용
            if (sortBy === 'count') {
                classRows.sort((a, b) => b.studentCount - a.studentCount);
            } else {
                classRows.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
            }
            
            classes = classRows;
            
            const [studentRows] = await db.execute(`
                SELECT s.id, s.name, s.sphone, s.pphone, 
                       DATE_FORMAT(s.insert_date, "%Y.%m.%d") as insert_date
                FROM class_status cs, student s, class_info ci
                WHERE cs.class_id = ci.id 
                AND s.id = cs.student_id 
                AND DATE_FORMAT(s.insert_date, "%Y%m") = DATE_FORMAT(NOW(), "%Y%m")
                ORDER BY s.name ASC
            `);
            newStudents = studentRows;
        }
        
        res.render('admin/dashboard', {
            user: user,
            classes: classes,
            newStudents: newStudents,
            currentSort: sortBy
        });
}));

router.get('/class/:id', asyncHandler(async (req, res) => {
        const user = req.session.user;
        const classId = req.params.id;
        
        const [classInfo] = await db.execute(
            'SELECT id, name FROM class_info WHERE id = ? AND liveStatus = 1',
            [classId]
        );
        
        if (classInfo.length === 0) {
            return res.redirect('/admin/dashboard');
        }
        
        if (user.code === 'T') {
            const [checkTeacher] = await db.execute(
                'SELECT * FROM class_info WHERE id = ? AND (teacherOne = ? OR teacherTwo = ?)',
                [classId, user.name, user.name]
            );
            
            if (checkTeacher.length === 0) {
                return res.redirect('/admin/dashboard');
            }
        }
        
        const [students] = await db.execute(`
            SELECT s.id, s.name, s.sphone, s.pphone, 
                   DATE_FORMAT(s.insert_date, "%Y.%m.%d") as insert_date
            FROM class_status cs
            JOIN student s ON s.id = cs.student_id
            WHERE cs.class_id = ? AND cs.status = 1
            ORDER BY s.name ASC
        `, [classId]);
        
        res.render('admin/class-detail', {
            user: user,
            classInfo: classInfo[0],
            students: students
        });
}));

router.get('/student/:id', asyncHandler(async (req, res) => {
        const user = req.session.user;
        const studentId = req.params.id;
        
        const [studentInfo] = await db.execute(`
            SELECT name, school, grade, year, sphone, pphone, 
                   DATE_FORMAT(insert_date, "%Y.%m.%d") as insert_date, memo
            FROM student 
            WHERE id = ?
        `, [studentId]);
        
        if (studentInfo.length === 0) {
            return res.redirect('/admin/dashboard');
        }
        
        res.render('admin/student-detail', {
            user: user,
            student: studentInfo[0]
        });
}));

router.post('/student/:id/memo', asyncHandler(async (req, res) => {
        const studentId = req.params.id;
        const { memo } = req.body;
        
        await db.execute(
            'UPDATE student SET memo = ? WHERE id = ?',
            [memo, studentId]
        );
        
        res.json({ success: true });
}));

module.exports = router;