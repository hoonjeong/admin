const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');

// 동기 fs 모듈도 필요
const fsSync = require('fs');

// Multer 설정 - 파일 업로드
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../upload/ai');
        // 동기적으로 디렉토리 생성
        try {
            if (!fsSync.existsSync(uploadDir)) {
                fsSync.mkdirSync(uploadDir, { recursive: true });
            }
            cb(null, uploadDir);
        } catch (error) {
            console.error('Directory creation error:', error);
            cb(error);
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const sanitizedName = file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname);
        cb(null, sanitizedName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { 
        fileSize: 10 * 1024 * 1024, // 10MB 제한
        files: 1 // 파일 개수 제한
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
        
        // MIME 타입과 확장자 모두 확인
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

// Gemini API 키 (환경 변수에서 가져오거나 하드코딩된 값 사용)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

// API 키 확인
if (!GEMINI_API_KEY) {
    console.error('Warning: GEMINI_API_KEY is not set in environment variables');
}

// 시험지 분석기 페이지
router.get('/exam-analyzer', checkAdminAuth, (req, res) => {
    res.render('ai/exam-analyzer', { user: req.session.user });
});

// 시험지 분석 API
router.post('/api/analyze-exam', checkAdminAuth, (req, res, next) => {
    upload.single('examFile')(req, res, async (err) => {
        // Multer 에러 처리
        if (err) {
            console.error('Upload error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ 
                    success: false, 
                    error: '파일 크기가 10MB를 초과합니다.' 
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


            // 파일 존재 확인
            try {
                await fs.access(req.file.path);
            } catch (accessError) {
                console.error('File access error:', accessError);
                return res.status(500).json({ 
                    success: false, 
                    error: '업로드된 파일을 찾을 수 없습니다.' 
                });
            }

            // 파일을 base64로 인코딩
            const fileBuffer = await fs.readFile(req.file.path);
            const base64File = fileBuffer.toString('base64');
            
            // MIME 타입 결정
            let mimeType = req.file.mimetype || 'image/jpeg';
            
            // PDF나 문서 파일의 경우 적절한 MIME 타입 설정
            const ext = path.extname(req.file.originalname).toLowerCase();
            if (ext === '.pdf') {
                mimeType = 'application/pdf';
            } else if (ext === '.doc') {
                mimeType = 'application/msword';
            } else if (ext === '.docx') {
                mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            } else if (ext === '.hwp') {
                mimeType = 'application/x-hwp';
            }

        const prompt = `**절대 규칙: <div>로 시작하고 </div>로 끝나는 HTML 코드만 출력. 다른 텍스트, 설명, 주석 절대 금지**

시험지를 분석하여 HTML 보고서를 생성합니다.

문제 목록 (문제 번호 /단원명/ 유형/ 배점 / 문제 요약 / 정답)

1. 배점을 고려하여 고난도 문항과 쉬운 문항을 분류하여 단원별, 유형별로 고난도 문항이 어떤 것인지 설명합니다.
2. 기본적으로 문제의 구성에 대한 총평을 작성합니다.
3. HTML보고서로 인터랙티브하게 작성할 보고서는 다음을 포함합니다.

(1) 시험 개요
학교, 학년, 학기, 과목, 총문항수, 총배점, 객관식/서술형 개수

(2) 시험 총평에 대해서 첫번째 분석한 것의 3, 4의 문제 구성에 대한 총평을 활용하여 학생과 학부모에게 도움이 되도록 상세히 작성합니다.
시험총평은 문제 구성에 대해서 상세하게 분석하여 주요 단원에 대한 분석한 결과를 자세히 적습니다.

(3) 출제 특징: 단원이나 유형별로 몇 문항, 얼마의 배점이 되었는지 비율로 설명합니다.

단원별 분포와 유형별 분포를 표로 작성:
- 단원별 분포 표: 단원명 | 문항수 | 배점 | 비율(%)
- 유형별 분포 표: 유형명 | 문항수 | 배점 | 비율(%)

표는 다음 스타일로 작성:
<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  <thead style="background: #f0f0f0;">
    <tr>
      <th style="border: 1px solid #ddd; padding: 8px;">항목</th>
      <th style="border: 1px solid #ddd; padding: 8px;">문항수</th>
      <th style="border: 1px solid #ddd; padding: 8px;">배점</th>
      <th style="border: 1px solid #ddd; padding: 8px;">비율(%)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid #ddd; padding: 8px;">내용</td>
      ...
    </tr>
  </tbody>
</table>

(4) 난이도 분석
난이도   문항 수   배점   비율   대표 문항 으로 구분하여 분석을 해주세요
예) --------------------------
구분     개수  배점 비율  문항번호
하 (기초)   6   18점   18%   1번, 3번, 7번
중 (표준)   10   34점   34%   2번, 5번, 8번, 16번
중상 (도전)   6   26점   26%   9번, 13번, 17번
상 (고난도)   4   22점   22%   19번, 24번, 25번
이 내용의 하단에는 각 문항의 번호와 유형에 대한 설명을 하나씩 써주세요.

(5) 출제 영역별 상세 분석
단원   유형  문항 수   배점(비율)  고난도문제   문제들의 특징
으로 분석하세요.
표로 내용을 분석한 후에는 각 단원별로 공부해야 할 내용들을 적어주세요.
학생에게 공부할 방향을 제시합니다.

(6) 문항 유형별 분석
유형을 중심으로 몇 문항이 출제되었는지, 비율과 함께 보고해주세요
유형 문제번호 배점(총합) 유형의 특징
을 작성해서 표로 만들어주세요

(7) 종합 출제 경향
문제의 단원과 유형을 판단하여 고난도 문제와 실수하지 말아야 할 문제들에 대해서 설명해주세요
고난도 문제에 대한 문제유형을 확인한 후에 이 단원을 공부하는 방법을 순서대로
1) 핵심요약
2) 공부방법 제안

(8) 수준별 학습 대책 및 전략
이 부분은 아래의 양식에 맞추어서 문항 분석을 토대로 학습전략을 제시해주세요
분석된 시험지의 과목에 맞게 분석을 해서 순서대로 제시해줘
1) 수준(상, 중, 하)별 학습전략
1)상위권 학습 전략:
2) 중위권 학습 전략:
3) 하위권 학습 전략:
2) 기간별 공부방법, 차후 시험 대비 전략

(9) 최종 권고사항
학생과 학부모에게 공부할 방향을 정리해서 제시해줘. 학부모에게 학생을 공부시키는 전문가로서의 입장을 전달하는 메시지를 만들어줘

**최종 출력 규칙 (절대 준수):**
1. 첫 글자는 반드시 '<div'로 시작
2. 마지막은 반드시 '</div>'로 종료
3. HTML 코드 외에 어떠한 텍스트, 설명, 주석도 포함하지 않음
4. 시험 문제 타이핑 결과는 보고서에 포함하지 않음
5. 모든 스타일은 인라인 style 속성으로만 작성
6. 차트나 그래프 대신 표(table)만 사용
7. 응답은 오직 하나의 <div>로 감싸진 HTML만 포함

반드시 <div style="padding: 20px; font-family: 'Noto Sans KR', sans-serif;">로 시작하고 </div>로 끝내세요.`;

            // API 키 확인
            if (!GEMINI_API_KEY) {
                throw new Error('GEMINI_API_KEY가 설정되지 않았습니다. 환경 변수를 확인해주세요.');
            }
            
            // Gemini API 호출
            console.log('Calling Gemini API...');
            const response = await axios.post(
                `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
                {
                    contents: [{
                        parts: [
                            { text: prompt },
                            {
                                inline_data: {
                                    mime_type: mimeType,
                                    data: base64File
                                }
                            }
                        ]
                    }]
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                    timeout: 60000 // 60초 타임아웃
                }
            );

            // 업로드된 파일 삭제
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('File deletion error:', unlinkError);
            }

            if (response.data && response.data.candidates && response.data.candidates[0]) {
                const content = response.data.candidates[0].content.parts[0].text;
                res.json({ success: true, content: content });
            } else {
                console.error('Invalid API response:', response.data);
                res.status(500).json({ 
                    success: false, 
                    error: 'AI 응답을 받지 못했습니다.' 
                });
            }
        } catch (error) {
            console.error('Exam analysis error:', error.response?.data || error.message);
            
            // 파일이 있으면 삭제
            if (req.file && req.file.path) {
                try {
                    await fs.unlink(req.file.path);
                } catch (unlinkError) {
                    console.error('File cleanup error:', unlinkError);
                }
            }
            
            // 에러 로깅
            console.error('Gemini API Error:', {
                message: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                code: error.code
            });
            
            // 에러 메시지 개선
            let errorMessage = '분석 중 오류가 발생했습니다.';
            if (error.response?.status === 400) {
                errorMessage = 'API 요청이 잘못되었습니다. API 키를 확인해주세요.';
            } else if (error.response?.status === 401 || error.response?.status === 403) {
                errorMessage = 'API 인증에 실패했습니다. API 키가 유효한지 확인해주세요.';
            } else if (error.response?.status === 429) {
                errorMessage = 'API 사용 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
            } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                errorMessage = '요청 시간이 초과되었습니다. 다시 시도해주세요.';
            } else if (error.response?.data?.error?.message) {
                errorMessage = error.response.data.error.message;
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            res.status(500).json({ 
                success: false, 
                error: errorMessage 
            });
        }
    });
});

// 독서 교재 만들기 페이지
router.get('/reading-material', checkAdminAuth, (req, res) => {
    res.render('ai/reading-material', { user: req.session.user });
});

// 독서 교재 생성 API
router.post('/api/generate-reading-material', checkAdminAuth, (req, res, next) => {
    upload.single('bookFile')(req, res, async (err) => {
        // Multer 에러 처리
        if (err) {
            console.error('Upload error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ 
                    success: false, 
                    error: '파일 크기가 10MB를 초과합니다.' 
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
            const { difficulty, target, characteristics, questionCount, additionalRequests } = req.body;

            if (!req.file) {
                return res.status(400).json({ 
                    success: false, 
                    error: '파일을 선택해주세요.' 
                });
            }


            // 파일 존재 확인
            try {
                await fs.access(req.file.path);
            } catch (accessError) {
                console.error('File access error:', accessError);
                return res.status(500).json({ 
                    success: false, 
                    error: '업로드된 파일을 찾을 수 없습니다.' 
                });
            }

            // 파일을 base64로 인코딩
            const fileBuffer = await fs.readFile(req.file.path);
            const base64File = fileBuffer.toString('base64');
            
            // MIME 타입 결정
            let mimeType = req.file.mimetype || 'image/jpeg';
            
            // PDF나 문서 파일의 경우 적절한 MIME 타입 설정
            const ext = path.extname(req.file.originalname).toLowerCase();
            if (ext === '.pdf') {
                mimeType = 'application/pdf';
            } else if (ext === '.doc') {
                mimeType = 'application/msword';
            } else if (ext === '.docx') {
                mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            } else if (ext === '.hwp') {
                mimeType = 'application/x-hwp';
            }

            const prompt = `당신은 학생을 위한 **독후활동 교재를 개발하는 교육 전문가**입니다. 당신의 목표는 단순한 줄거리 요약이나 내용 확인을 넘어, 아이들의 **사고력, 비판적 사고, 창의력, 공감 능력, 그리고 자기 생각을 표현하는 능력**을 종합적으로 향상시킬 수 있는 독후활동 질문 목록을 만드는 것입니다.

첨부된 책/문서의 내용을 철저히 분석하여 깊이 있는 사고를 유도하고 다양한 반응을 이끌어낼 수 있는 **양질의 독후활동 질문**들을 생성해 주세요.

**요청 정보:**
- 난이도: ${difficulty || '중'}
- 대상: ${target || '중학생'}
- 교재 특징: ${characteristics || '일반 독서'}
- 문제 개수: ${questionCount || '10'}개
- 추가 요청사항: ${additionalRequests || '없음'}

**질문 생성 원칙:**

1. **목표 지향성**: 질문은 독서 내용의 단순한 사실 확인이나 줄거리 요약을 직접적으로 요구하지 않아야 합니다. 대신, 아이가 스스로 생각하고 판단하며 감정을 표현하고, 책 속 세계를 자신의 삶과 연결짓도록 유도하는 **개방형 질문**이어야 합니다.

2. **사고 확장 요소 포함**:
   - **'왜'와 '만약' 질문 적극 활용**: 인물의 행동, 사건의 원인과 결과, 작가의 의도 등을 추론하고, 대안적 상황이나 선택을 상상하도록 돕습니다.
   - **개인적 연결 촉진**: 책의 내용이나 인물을 아이 자신의 경험, 감정, 일상생활과 연결하여 적용 능력을 키울 수 있도록 합니다.
   - **다양한 관점 및 공감 유도**: 주인공이 아닌 다른 인물의 입장에서 이야기를 상상하거나, 인물 간의 갈등 상황을 분석하여 공감 능력을 발달시킵니다.
   - **비판적 사고 유도**: 인물의 행동이나 선택에 대한 찬반 의견을 제시하고 근거를 마련하거나, 도덕적 옳고 그름을 평가해보도록 합니다.
   - **창의적 상상 및 재구성**: 이야기의 결말을 바꾸거나 이어쓰기, 다른 장르로 재창작하기, 책 속 장면을 그림으로 표현하고 설명하기와 같은 활동을 질문 형식으로 제안합니다.
   - **중심 내용 및 주제 파악**: 글에 명시되어 있지 않은 중심 내용을 스스로 만들어 내거나, 작가가 책 제목을 통해 전하려는 중심 생각을 찾아보도록 합니다.

3. **학생 눈높이**: 질문의 언어와 형식은 ${target || '중학생'}이 쉽게 이해하고 부담 없이 답변할 수 있도록 쉽고 명확해야 합니다. 강요하거나 취조하는 듯한 분위기 대신, 자연스러운 대화를 유도하는 톤앤매너를 유지합니다.

4. **후속 질문 가능성**: 하나의 질문이 더 깊이 있는 사고나 토론으로 이어질 수 있는 확장성을 내포하고 있다면 좋습니다.

**출력 형식:**

[독서 교재 제목: (책/문서 제목)]
[대상: ${target || '중학생'}] [난이도: ${difficulty || '중'}]

===== 독후활동 질문 목록 =====

**📚 창의적 사고 질문** (${Math.ceil(questionCount * 0.25) || 3}개)

질문 1: [구체적인 질문]
💡 교육적 효과: [이 질문이 어떤 사고력을 어떻게 키우는지 간략히 설명]

질문 2: [구체적인 질문]
💡 교육적 효과: [이 질문이 어떤 사고력을 어떻게 키우는지 간략히 설명]

활동 제안: [질문과 연계된 구체적인 독후활동 (예: 그림 그리기, 역할극, 모의재판 등)]
💡 활동 효과: [이 활동이 어떤 사고력을 어떻게 키우는지 간략히 설명]

---

**🤔 비판적 사고 질문** (${Math.ceil(questionCount * 0.25) || 3}개)

질문 1: [구체적인 질문]
💡 교육적 효과: [이 질문이 어떤 사고력을 어떻게 키우는지 간략히 설명]

질문 2: [구체적인 질문]
💡 교육적 효과: [이 질문이 어떤 사고력을 어떻게 키우는지 간략히 설명]

---

**❤️ 공감 및 관점 전환 질문** (${Math.ceil(questionCount * 0.25) || 2}개)

질문 1: [구체적인 질문]
💡 교육적 효과: [이 질문이 어떤 사고력을 어떻게 키우는지 간략히 설명]

질문 2: [구체적인 질문]
💡 교육적 효과: [이 질문이 어떤 사고력을 어떻게 키우는지 간략히 설명]

---

**🌟 개인적 연결 및 적용 질문** (${Math.ceil(questionCount * 0.25) || 2}개)

질문 1: [구체적인 질문]
💡 교육적 효과: [이 질문이 어떤 사고력을 어떻게 키우는지 간략히 설명]

질문 2: [구체적인 질문]
💡 교육적 효과: [이 질문이 어떤 사고력을 어떻게 키우는지 간략히 설명]

===== 독후활동 질문 끝 =====

**📖 토론 가이드**
- 이 책을 읽고 나서 가장 기억에 남는 장면과 그 이유
- 책에서 배운 교훈을 실생활에 적용하는 방법
- 추가로 탐구해볼 만한 주제나 질문들

**✏️ 창의적 독후활동 제안**
1. [구체적인 활동 1]
2. [구체적인 활동 2]
3. [구체적인 활동 3]

**💭 교사/학부모를 위한 지도 팁**
- 질문을 던질 때 충분한 생각할 시간을 주세요
- 정답이 없는 질문임을 강조하고 다양한 의견을 존중해주세요
- 아이의 답변에 "왜 그렇게 생각했어?"라는 후속 질문으로 사고를 확장시켜주세요`;

            // API 키 확인
            if (!GEMINI_API_KEY) {
                throw new Error('GEMINI_API_KEY가 설정되지 않았습니다. 환경 변수를 확인해주세요.');
            }
            
            // Gemini API 호출
            console.log('Calling Gemini API...');
            const response = await axios.post(
                `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
                {
                    contents: [{
                        parts: [
                            { text: prompt },
                            {
                                inline_data: {
                                    mime_type: mimeType,
                                    data: base64File
                                }
                            }
                        ]
                    }]
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                    timeout: 60000 // 60초 타임아웃
                }
            );

            // 업로드된 파일 삭제
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('File deletion error:', unlinkError);
            }

            if (response.data && response.data.candidates && response.data.candidates[0]) {
                const content = response.data.candidates[0].content.parts[0].text;
                res.json({ success: true, content: content });
            } else {
                console.error('Invalid API response:', response.data);
                res.status(500).json({ 
                    success: false, 
                    error: 'AI 응답을 받지 못했습니다.' 
                });
            }
        } catch (error) {
            console.error('Reading material generation error:', error.response?.data || error.message);
            
            // 파일이 있으면 삭제
            if (req.file && req.file.path) {
                try {
                    await fs.unlink(req.file.path);
                } catch (unlinkError) {
                    console.error('File cleanup error:', unlinkError);
                }
            }
            
            // 에러 메시지 개선
            let errorMessage = '교재 생성 중 오류가 발생했습니다.';
            if (error.response?.status === 400) {
                errorMessage = 'API 요청이 잘못되었습니다.';
            } else if (error.response?.status === 401 || error.response?.status === 403) {
                errorMessage = 'API 인증에 실패했습니다.';
            } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                errorMessage = '요청 시간이 초과되었습니다. 다시 시도해주세요.';
            } else if (error.response?.data?.error?.message) {
                errorMessage = error.response.data.error.message;
            }
            
            res.status(500).json({ 
                success: false, 
                error: errorMessage 
            });
        }
    });
});

// 수행평가 첨삭 페이지
router.get('/performance-review', checkAdminAuth, (req, res) => {
    res.render('ai/performance-review', { user: req.session.user });
});

// 연구 주제 추천 페이지
router.get('/research-topic', checkAdminAuth, (req, res) => {
    res.render('ai/research-topic', { user: req.session.user });
});

// 수행평가 첨삭 API
router.post('/api/review-performance', checkAdminAuth, async (req, res) => {
    try {
        const { conditions, criteria, content } = req.body;

        if (!content) {
            return res.json({ success: false, error: '수행평가 내용을 입력해주세요.' });
        }

        const prompt = `학생이 작성한 수행평가를 첨삭해주세요.

**첨삭 조건:**
${conditions || '특별한 조건 없음'}

**평가기준:**
${criteria || '평가기준 없음'}

**학생이 작성한 수행평가:**
${content}

**첨삭 지침:**
1. 위의 첨삭 조건에 맞게 첨삭하기
2. 평가기준을 고려하여 해당 기준에 부합하도록 개선하기
3. 첨삭 조건과 평가기준 외의 내용은 최대한 수정하지 않기
4. 오타, 띄어쓰기, 적합한 대체 단어 등 적용하기
5. 학생의 원래 의도와 문체를 최대한 보존하기
6. 수정된 부분은 자연스럽게 문맥에 녹아들도록 하기
7. 평가기준에 명시된 항목들이 충족되도록 보완하기

**중요:** 
- 첨삭된 전체 내용만 출력하세요
- 설명이나 주석 없이 첨삭된 결과만 제공하세요
- 원문의 구조와 형식을 유지하세요`;

        // Gemini API 호출
        const response = await axios.post(
            `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
            {
                contents: [{
                    parts: [{ text: prompt }]
                }]
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        if (response.data && response.data.candidates && response.data.candidates[0]) {
            const reviewedContent = response.data.candidates[0].content.parts[0].text;
            res.json({ success: true, content: reviewedContent });
        } else {
            res.json({ success: false, error: 'AI 응답을 받지 못했습니다.' });
        }
    } catch (error) {
        console.error('Performance review error:', error);
        res.json({ success: false, error: '첨삭 중 오류가 발생했습니다.' });
    }
});

// 연구 주제 추천 API
router.post('/api/research-topic', checkAdminAuth, async (req, res) => {
    try {
        const { career, subject, keywords, additionalTopic, fieldType } = req.body;

        if (!career || !subject || !keywords || !fieldType) {
            return res.json({ success: false, error: '필수 항목을 모두 입력해주세요.' });
        }

        const prompt = `**제목: 고등학생 생기부 기재용 탐구 보고서 주제 제안 요청**

안녕하세요, 저는 고등학생이며, 학교생활기록부(생기부)에 기재될 탐구 보고서 주제 아이디어를 얻고자 합니다. 아래 정보를 바탕으로 제 탐구 역량과 진로 관심사를 효과적으로 보여줄 수 있는 구체적이고 심층적인 탐구 주제 3~5개를 제안해 주세요.

**[학생 정보]**
- 관심 진로/학과: ${career}
- 탐구하려는 교과목: ${subject}
- 개인적인 관심 키워드/호기심: ${keywords}
- 추가 참고 주제: ${additionalTopic || '없음'}
- 탐구 분야: ${fieldType}

**[AI가 주제를 제안할 때 참고할 지침 및 주의사항]**
AI는 아래의 사항들을 고려하여 주제를 제안해야 합니다.

1. **생기부 기재 목적 이해:** 제안하는 주제는 학생의 **학업 역량, 전공 적합성, 발전 가능성**을 효과적으로 드러낼 수 있어야 합니다. 단순히 지식 습득을 넘어, **주도성, 호기심, 문제 해결 능력, 이론적 지식을 실제 문제에 적용하는 능력**을 보여줄 수 있는 방향성을 포함해야 합니다.

2. **교과 연계성 강조:** 제안하는 주제는 선택한 교과목의 교육 과정 내용(교과서, 수업 내용, 단원 등)과 **자연스럽게 연결**될 수 있어야 합니다. 진로와 관련이 없더라도 연결고리를 만들 수 있는 주제여야 합니다.

3. **구체적이고 심층적인 탐구 가능성:**
   - 추상적이거나 너무 광범위한 주제보다는 **내용과 목적이 한눈에 드러나도록** 구체적인 키워드를 포함한 주제를 제안해 주세요.
   - 고등학생 수준에서 **수 개월 동안 탐구 및 연구 수행이 가능한 현실적인 주제**를 고려해야 합니다.
   - 단순한 자료 조사를 넘어, **자신의 생각과 호기심을 바탕으로 깊이 있는 질문을 던지고 해결 방안을 모색**할 수 있는 주제가 좋습니다.
   - **'사용자 중심'의 관점**에서 해결책을 모색할 수 있는 주제는 높은 평가를 받을 수 있습니다 (예: 시각장애인 문맹률 개선 연구에서 사용자의 어려움에 초점).

4. **탐구 동기, 과정, 느낀 점 강조:** 주제는 학생이 **'왜' 이 탐구를 진행했는지(탐구 동기), '무엇을' 탐구했고, 그 과정에서 '무엇을' 알게 되었으며, '어떤 점에서 성장했는지(느낀 점)**를 상세하게 작성할 수 있는 여지를 주어야 합니다. AI는 주제 제안 시 이러한 보고서 구성 요소를 고려해야 합니다.

5. **피해야 할 용어 및 방식 (매우 중요):**
   - **'연구 보고서 (소논문)' 사용 제한:** 생기부 기재 시, **'수학과제 탐구, 사회문제 탐구, 융합과학 탐구, 과학과제 연구, 사회과제 연구' 5개 과목**을 제외하고는 '연구 보고서(소논문)'라는 용어를 사용하는 것이 제한됩니다. 따라서, 이 5개 과목이 아닌 경우, **'탐구 보고서' 또는 '보고서'**와 같은 용어를 사용하여 주제를 제안해 주세요.
   - **'산출물 실적' 기재 금지:** 연구보고서 형태의 **산출물 실적(제목, 연구주제 및 참여인원, 소요시간)**은 생기부에 기재할 수 없습니다. 따라서 주제 제안 시, 이러한 '실적' 자체가 아닌, **탐구 활동의 '과정'과 '내용'에 집중**할 수 있도록 유도해야 합니다.
   - **'연구 주제' 단어 자체는 금지 아님:** '연구 주제'라는 단어 자체는 금지되지 않지만, 그 구체적인 내용을 상세하게 기재하는 것은 제한될 수 있습니다. 제안하는 주제는 '연구 주제를 선정하는 과정에서 ~를 함'과 같이 **탐구 과정의 서술에 활용될 수 있는 형태**가 좋습니다.
   - **표절 방지:** 제안하는 주제는 기존 연구를 단순히 모방하는 것이 아니라, **학생 자신의 호기심과 관점**을 담을 수 있는 방향이어야 합니다. 기존 연구를 참고하더라도 자신만의 해석과 확장 가능성을 제시할 수 있는 주제가 바람직합니다.

**[제안 주제 형식]** 
각 주제는 다음과 같은 형식으로 제시해 주세요.

===== 주제 1 =====
**주제명:** (내용과 목적이 명확히 드러나는 구체적인 제목)
**관련 진로/학과:** ${career}
**관련 교과목:** ${subject}
**탐구 방향성/주요 내용:** 
(이 주제를 통해 어떤 역량을 보여줄 수 있는지, 어떤 질문을 해결할 수 있는지 등 설명)
**생기부 기재 시 강조할 수 있는 역량:** 
(학업 역량, 전공 적합성, 발전 가능성 등 구체적 언급)

===== 주제 2 =====
(위와 동일한 형식)

===== 주제 3 =====
(위와 동일한 형식)

===== 주제 4 =====
(위와 동일한 형식)

===== 주제 5 =====
(위와 동일한 형식)

**[추가 조언]**
- 각 주제별로 탐구 시 참고할 수 있는 구체적인 방법론이나 접근법
- 주제를 발전시킬 수 있는 방향성
- 생기부 기재 시 주의할 점`;

        // Gemini API 호출
        const response = await axios.post(
            `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
            {
                contents: [{
                    parts: [{ text: prompt }]
                }]
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        if (response.data && response.data.candidates && response.data.candidates[0]) {
            const content = response.data.candidates[0].content.parts[0].text;
            res.json({ success: true, content: content });
        } else {
            res.json({ success: false, error: 'AI 응답을 받지 못했습니다.' });
        }
    } catch (error) {
        console.error('Research topic generation error:', error);
        res.json({ success: false, error: '주제 추천 중 오류가 발생했습니다.' });
    }
});

// 블로그 컨텐츠 생성기 페이지
router.get('/blog-generator', checkAdminAuth, (req, res) => {
    res.render('ai/blog-generator', { user: req.session.user });
});

// 블로그 컨텐츠 생성 API
router.post('/api/generate-blog', checkAdminAuth, async (req, res) => {
    try {
        const { topic, title, keywords, reference } = req.body;

        if (!topic || !title) {
            return res.json({ success: false, error: '블로그 주제와 제목은 필수입니다.' });
        }

        const prompt = `**[AI의 역할]**
당신은 학원 블로그 글쓰기 전문가이자 검색 엔진 최적화(SEO) 및 학부모의 공감을 이끌어내 등록으로 이어지는 마케팅 글쓰기 전문가입니다.

**[작성 정보]**
블로그 주제: ${topic}
블로그 제목: ${title}
핵심 키워드: ${keywords}
참고 내용: ${reference}

**[최종 목표]**
네이버 블로그에 학부모가 좋아하고, 검색이 잘 되며, 읽기 쉬운 학원 홍보 글을 작성하세요.

**[글쓰기 핵심 지침]**

**1. 글의 목적 및 타겟 학부모 이해**
- 이 글의 궁극적인 목표(학원 상담 예약, 설명회 신청, 강좌 등록 문의 등)를 명확히 하고 구매 동선을 설계하세요
- 학부모의 궁금증과 니즈를 파악하여 '나에게 무슨 득이 되지?'라는 질문에 답하세요
- 학원 서비스의 혜택을 학부모가 이해하기 쉬운 언어로 번역하여 설명하세요

**2. 검색 엔진 최적화 (SEO) 전략**
- 키워드 배치: 제목, 본문 첫 문단, 중간 소제목에 핵심 키워드를 자연스럽게 포함시키세요
- 충분한 분량: 1800-2500자 정도로 작성하여 검색 노출 가능성을 높이세요
- 학원의 전문성이 드러나도록 주제와 관련된 전문적이고 유용한 정보를 제공하세요

**3. 가독성을 높이는 글쓰기 기술**
- 두괄식 구성: 가장 중요한 내용을 글의 첫 부분에 제시하고 이후 상세 설명을 전개하세요
- 쉬운 언어: 초등학교 수준의 쉽고 대화하듯 편안한 문체를 사용하세요
- 짧은 문장과 단락: 한 문장에는 한 가지 내용만, 2-3줄로 문단을 구성하세요
- 능동태 활용: 간결하고 직관적인 메시지 전달을 위해 능동태를 주로 사용하세요
- 글머리 기호나 번호를 활용하여 정보를 체계적으로 정리하세요

**4. 학부모 공감 및 행동 유도**
- 공감과 다독임: 훈계하는 어조 대신 공감하고 다독여주는 친근한 말투를 사용하세요
- 구체적 사례: 실제 학생들의 변화 사례나 성공 스토리를 포함시키세요
- 정보+감성: 입시 정보, 학습법 등 유용한 정보와 학원의 따뜻한 분위기를 함께 전달하세요
- 행동 유도(CTA): 글 마지막에 "지금 상담 신청하세요", "무료 체험 신청하기" 등 명확한 행동을 유도하세요

**5. 블로그 형식 요구사항**
- 마크다운 문법 사용 금지 (**, ##, ### 등 사용하지 마세요)
- 순수한 텍스트 형식으로만 작성하세요
- 소제목은 [소제목] 형태로 표시하고 위아래 줄바꿈으로 구분하세요
- 강조가 필요한 부분은 '작은따옴표' 또는 "큰따옴표"를 사용하세요
- 글머리 기호는 - 또는 • 를 사용하세요

**6. 글의 구조**
1) 도입부: 학부모의 고민이나 관심사로 시작하여 공감대 형성
2) 본문 1: 주제와 관련된 핵심 정보나 해결책 제시
3) 본문 2: 우리 학원의 차별화된 프로그램이나 강점 소개
4) 본문 3: 실제 사례나 후기를 통한 신뢰도 구축
5) 마무리: 핵심 내용 요약 및 구체적인 행동 유도

**[작성 시 주의사항]**
- 허위/과장 광고 금지: 정확한 사실만을 기반으로 작성하세요
- 전문 용어나 어려운 한자어는 쉬운 말로 풀어서 설명하세요
- 학부모가 궁금해할 만한 내용을 예상하여 선제적으로 답변하세요
- 글을 다 쓴 후 학부모 입장에서 다시 읽어보며 공감되는지 확인하세요

이제 위의 지침에 따라 학부모의 마음을 움직이는 효과적인 블로그 글을 작성해주세요.`;

        // Gemini API 호출
        const response = await axios.post(
            `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
            {
                contents: [{
                    parts: [{ text: prompt }]
                }]
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data && response.data.candidates && response.data.candidates[0]) {
            const content = response.data.candidates[0].content.parts[0].text;
            res.json({ success: true, content: content });
        } else {
            res.json({ success: false, error: 'AI 응답을 받지 못했습니다.' });
        }
    } catch (error) {
        console.error('Blog generation error:', error);
        res.json({ success: false, error: error.message });
    }
});

module.exports = router;