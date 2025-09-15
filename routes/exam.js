const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const db = require('../config/database');

// Multer 설정 - 메모리 스토리지 사용 (DB에 직접 저장)
const storage = multer.memoryStorage();

const upload = multer({ 
    storage: storage,
    limits: { 
        fileSize: 50 * 1024 * 1024, // 50MB 제한
        files: 1
    },
    fileFilter: function (req, file, cb) {
        // 허용된 MIME 타입
        const allowedMimeTypes = [
            'image/jpeg',
            'image/jpg', 
            'image/png',
            'image/gif',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/haansofthwp',
            'application/x-hwp'
        ];
        
        // 허용된 확장자
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx', '.hwp'];
        const fileExtension = path.extname(file.originalname).toLowerCase();
        
        if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
            return cb(null, true);
        } else {
            const error = new Error(`지원하지 않는 파일 형식입니다. (${fileExtension})`);
            error.code = 'INVALID_FILE_TYPE';
            return cb(error);
        }
    }
});

// 미들웨어: 관리자 권한 체크
const checkAdminAuth = (req, res, next) => {
    if (!req.session.user || req.session.user.code !== 'O') {
        return res.redirect('/auth/login');
    }
    next();
};

// 학교별 기출 추가 페이지
router.get('/add', checkAdminAuth, (req, res) => {
    res.render('exam/add', { user: req.session.user });
});

// 기출문제 목록 페이지
router.get('/list', checkAdminAuth, async (req, res) => {
    try {
        const [exams] = await db.execute(
            'SELECT id, file_name, company, subject, school, year, grade, term, test, insert_time FROM ED_TYPE_TB ORDER BY insert_time DESC'
        );
        res.render('exam/list', { user: req.session.user, exams });
    } catch (error) {
        console.error('기출문제 목록 조회 오류:', error);
        res.render('exam/list', { user: req.session.user, exams: [], error: '목록을 불러오는 중 오류가 발생했습니다.' });
    }
});

// 파일명 분석 함수
function analyzeFileName(fileName) {
    const result = {
        fileName: fileName,
        company: '',
        subject: '',
        school: '',
        year: '',
        grade: '',
        term: '',
        test: ''
    };

    try {
        // 파일명에서 확장자 제거
        const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
        
        // 패턴: [비상 문학]계남고 24년 1학기 기말...
        // 대괄호 안의 내용과 나머지 부분 분리
        const bracketMatch = nameWithoutExt.match(/\[([^\]]+)\]/);
        if (!bracketMatch) {
            return result;
        }
        
        // 대괄호 안의 내용 처리
        const bracketContent = bracketMatch[1].trim();
        
        // 수특으로 시작하는 경우 특별 처리
        if (bracketContent.startsWith('수특')) {
            result.company = 'EBS';
            result.subject = bracketContent;  // 전체 내용을 과목으로 (예: "수특 언매")
            result.grade = '고3';
        } else {
            // 기존 처리 로직
            const bracketParts = bracketContent.split(/\s+/);
            if (bracketParts.length >= 2) {
                result.company = bracketParts[0];
                result.subject = bracketParts.slice(1).join(' ');
            } else if (bracketParts.length === 1) {
                result.subject = bracketParts[0];
            }
        }
        
        // 대괄호 이후 내용
        const afterBracket = nameWithoutExt.substring(bracketMatch.index + bracketMatch[0].length);
        
        // 학교명 찾기 (한글+고)
        const schoolMatch = afterBracket.match(/([가-힣]+고)/);
        if (schoolMatch) {
            result.school = schoolMatch[1];
        }
        
        // 년도 찾기 (2자리 숫자 + 년)
        const yearMatch = afterBracket.match(/(\d{2})\s*년/);
        if (yearMatch) {
            result.year = yearMatch[1];
        }
        
        // 학기 찾기
        const termMatch = afterBracket.match(/(\d)\s*학기/);
        if (termMatch) {
            result.term = termMatch[1];
        }
        
        // 시험 종류 찾기
        const testMatch = afterBracket.match(/(중간|기말)/);
        if (testMatch) {
            result.test = testMatch[1];
        }
        
        // 과목에 따른 학년 자동 설정 (수특이 아닌 경우에만)
        if (result.subject && !result.subject.startsWith('수특')) {
            const subjectLower = result.subject.toLowerCase();
            if (subjectLower === '국어') {
                result.grade = '고1';
            } else if (subjectLower === '문학' || subjectLower === '독서') {
                result.grade = '고2';
            }
        }
        
    } catch (error) {
    }

    return result;
}

// 파일명 분석 API
router.post('/api/analyze-filename', checkAdminAuth, (req, res) => {
    const { fileName } = req.body;
    const analysis = analyzeFileName(fileName);
    res.json(analysis);
});

// 업로드된 파일 목록 API
router.get('/api/files', checkAdminAuth, async (req, res) => {
    try {
        const [files] = await db.execute(
            'SELECT DISTINCT file_name FROM ED_TYPE_TB'
        );
        const fileNames = files.map(f => f.file_name);
        res.json({ files: fileNames });
    } catch (error) {
        console.error('파일 목록 조회 오류:', error);
        res.json({ files: [] });
    }
});

// 기출문제 업로드 API
router.post('/api/upload', checkAdminAuth, (req, res, next) => {
    upload.single('examFile')(req, res, async (err) => {
        // Multer 에러 처리
        if (err) {
            console.error('Upload error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ 
                    success: false, 
                    error: '파일 크기가 50MB를 초과합니다.' 
                });
            } else if (err.code === 'INVALID_FILE_TYPE') {
                return res.status(400).json({ 
                    success: false, 
                    error: err.message 
                });
            } else {
                return res.status(500).json({ 
                    success: false, 
                    error: '파일 업로드 중 오류가 발생했습니다.' 
                });
            }
        }

        try {
            if (!req.file) {
                return res.status(400).json({ 
                    success: false, 
                    error: '파일을 선택해주세요.' 
                });
            }

            const {
                fileName,
                company,
                subject,
                school,
                year,
                grade,
                term,
                test
            } = req.body;

            // 필수 필드 확인
            if (!fileName || !school || !year || !grade || !term || !test) {
                return res.status(400).json({
                    success: false,
                    error: '필수 정보를 모두 입력해주세요.'
                });
            }

            // 데이터베이스에 저장
            const query = `
                INSERT INTO ED_TYPE_TB 
                (file_name, company, subject, school, year, grade, term, test, content, content_type, insert_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `;

            const values = [
                fileName,
                company || null,
                subject || null,
                school,
                parseInt(year),
                grade,
                parseInt(term),
                test,
                req.file.buffer, // 파일 내용
                req.file.mimetype // 파일 타입
            ];

            const [result] = await db.execute(query, values);


            res.json({ 
                success: true, 
                message: '기출문제가 성공적으로 저장되었습니다.',
                id: result.insertId 
            });

        } catch (error) {
            console.error('기출문제 저장 오류:', error);
            res.status(500).json({ 
                success: false, 
                error: '데이터베이스 저장 중 오류가 발생했습니다.' 
            });
        }
    });
});

// 기출문제 다운로드 API
router.get('/download/:id', checkAdminAuth, async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT file_name, content, content_type FROM ED_TYPE_TB WHERE id = ?',
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).send('파일을 찾을 수 없습니다.');
        }

        const exam = rows[0];
        res.setHeader('Content-Type', exam.content_type);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(exam.file_name)}"`);
        res.send(exam.content);
    } catch (error) {
        console.error('파일 다운로드 오류:', error);
        res.status(500).send('파일 다운로드 중 오류가 발생했습니다.');
    }
});

// 기출문제 삭제 API
router.delete('/api/delete/:id', checkAdminAuth, async (req, res) => {
    try {
        const [result] = await db.execute(
            'DELETE FROM ED_TYPE_TB WHERE id = ?',
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                error: '삭제할 기출문제를 찾을 수 없습니다.'
            });
        }

        res.json({
            success: true,
            message: '기출문제가 삭제되었습니다.'
        });
    } catch (error) {
        console.error('기출문제 삭제 오류:', error);
        res.status(500).json({
            success: false,
            error: '삭제 중 오류가 발생했습니다.'
        });
    }
});

module.exports = router;