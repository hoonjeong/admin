# Eden Language Academy Admin System

이든배움국어학원 관리 시스템

## 기능

### 관리자/선생님 기능
- 대시보드: 수강반 관리, 신규생 확인
- 강의 관리: 강의 목록 조회, 강의 상세 정보, 질문 확인
- 문자 발송: 학생/학부모에게 SMS 발송
- 학생 정보 관리

### 시스템 기능
- 사용자 인증 (로그인/로그아웃)
- 세션 관리
- 권한별 접근 제어 (관리자/선생님)

## 기술 스택

- **Backend**: Node.js, Express.js
- **Database**: MySQL
- **View Engine**: EJS
- **Authentication**: Express-session, bcryptjs
- **Others**: dotenv, nodemailer, axios

## 설치 및 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 변수 설정
`.env.example` 파일을 `.env`로 복사하고 설정값을 입력하세요.

```bash
cp .env.example .env
```

주요 설정:
- `DB_*`: 데이터베이스 연결 정보
- `SESSION_SECRET`: 세션 암호화 키
- `SMS_*`: SMS API 설정 (선택사항)

### 3. 실행
```bash
# 개발 모드
npm run dev

# 프로덕션 모드
npm start
```

## 프로젝트 구조

```
admin/
├── config/             # 설정 파일
│   └── database.js     # DB 연결 설정
├── middleware/         # 미들웨어
│   └── adminAuth.js    # 관리자 인증 미들웨어
├── routes/             # 라우터 파일들
│   ├── admin.js        # 관리자 기능 라우터
│   ├── ai.js           # AI 기능 라우터 (분석, 블로그 생성 등)
│   ├── auth.js         # 인증 라우터 (로그인/회원가입)
│   ├── board.js        # 게시판 라우터
│   ├── class.js        # 수업 관리 라우터
│   ├── exam.js         # 시험 관리 라우터
│   ├── home.js         # 홈페이지 라우터
│   ├── lecture.js      # 강의 관리 라우터
│   ├── post.js         # 게시물 관리 라우터
│   ├── sms.js          # SMS 발송 라우터
│   ├── student.js      # 학생 관리 라우터
│   ├── teacher.js      # 선생님 기능 라우터
│   ├── user.js         # 사용자 관리 라우터
│   └── video.js        # 동영상 관리 라우터
├── views/              # EJS 템플릿 파일들
│   ├── admin/          # 관리자 페이지
│   │   ├── dashboard.ejs      # 대시보드
│   │   ├── class-detail.ejs   # 반 상세 정보
│   │   └── student-detail.ejs # 학생 상세 정보
│   ├── ai/             # AI 기능 페이지
│   │   ├── blog-generator.ejs    # 블로그 생성
│   │   ├── exam-analyzer.ejs     # 시험 분석
│   │   ├── performance-review.ejs # 성적 리뷰
│   │   ├── reading-material.ejs  # 독서 자료
│   │   └── research-topic.ejs    # 연구 주제
│   ├── auth/           # 인증 페이지
│   │   ├── login.ejs           # 로그인
│   │   ├── register.ejs        # 회원가입
│   │   ├── find-email.ejs      # 이메일 찾기
│   │   └── find-password.ejs   # 비밀번호 찾기
│   ├── board/          # 게시판 페이지
│   │   ├── index.ejs   # 게시판 목록
│   │   └── detail.ejs  # 게시물 상세
│   ├── class/          # 수업 관리 페이지
│   │   ├── add.ejs     # 수업 추가
│   │   └── edit.ejs    # 수업 수정
│   ├── exam/           # 시험 관리 페이지
│   │   ├── list.ejs    # 시험 목록
│   │   └── add.ejs     # 시험 추가
│   ├── lecture/        # 강의 관리 페이지
│   │   ├── list.ejs    # 강의 목록
│   │   ├── add.ejs     # 강의 추가
│   │   ├── edit.ejs    # 강의 수정
│   │   └── view.ejs    # 강의 보기
│   ├── post/           # 게시물 관리 페이지
│   │   ├── list.ejs    # 게시물 목록
│   │   ├── write.ejs   # 게시물 작성
│   │   ├── edit.ejs    # 게시물 수정
│   │   └── view.ejs    # 게시물 보기
│   ├── sms/            # SMS 관리 페이지
│   │   ├── send.ejs    # SMS 발송
│   │   └── history.ejs # 발송 이력
│   ├── student/        # 학생 관리 페이지
│   │   ├── add.ejs     # 학생 추가
│   │   ├── edit.ejs    # 학생 수정
│   │   ├── manage.ejs  # 학생 관리
│   │   ├── courses.ejs # 수강 과목
│   │   └── exited.ejs  # 수료생 관리
│   ├── teacher/        # 선생님 페이지
│   │   ├── lectures.ejs       # 강의 목록
│   │   ├── lecture-detail.ejs # 강의 상세
│   │   └── sms.ejs            # SMS 발송
│   ├── user/           # 사용자 페이지
│   │   ├── login.ejs   # 로그인
│   │   ├── register.ejs # 회원가입
│   │   └── signup.ejs  # 가입
│   ├── video/          # 동영상 관리 페이지
│   │   ├── index.ejs   # 동영상 목록
│   │   └── detail.ejs  # 동영상 상세
│   ├── partials/       # 공통 컴포넌트
│   │   ├── navbar.ejs  # 네비게이션
│   │   ├── styles.ejs  # CSS 스타일
│   │   └── scripts.ejs # JavaScript
│   ├── home/           # 홈페이지
│   │   └── index.ejs   # 메인 페이지
│   ├── layout.ejs      # 기본 레이아웃
│   ├── error.ejs       # 에러 페이지
│   └── 404.ejs         # 404 페이지
├── public/             # 정적 파일들
│   ├── css/            # CSS 파일들
│   ├── js/             # JavaScript 파일들
│   │   └── main.js     # 메인 JavaScript
│   └── image/          # 이미지 파일들 (선생님 프로필 등)
├── utils/              # 유틸리티 함수들
│   ├── constants.js    # 상수 정의
│   ├── database.js     # 데이터베이스 유틸
│   ├── dbHelpers.js    # DB 헬퍼 함수
│   ├── logger.js       # 로깅 유틸
│   └── validators.js   # 유효성 검증
├── upload/             # 업로드 파일 저장소
├── node_modules/       # npm 패키지들
├── app.js              # 메인 애플리케이션 파일
├── package.json        # 프로젝트 설정
├── package-lock.json   # 의존성 잠금
├── optimize_db.sql     # 데이터베이스 최적화 스크립트
└── README.md           # 프로젝트 설명서
```

## 데이터베이스 스키마

### 주요 테이블
- `user_info`: 사용자 정보
- `student`: 학생 정보
- `class_info`: 수강반 정보
- `class_status`: 수강 상태
- `lecture`: 강의 정보
- `question`: 질문 정보
- `file_status`, `file_info`: 파일 관리

## ⚠️ 중요 주의사항

**🚨 데이터베이스 관련 경고 🚨**
- **이 시스템은 실제 운영 중인 데이터베이스를 사용합니다**
- **절대로 DROP, ALTER, TRUNCATE 등의 구조 변경 작업을 수행하지 마세요**
- **데이터 손실이 발생할 수 있는 모든 작업을 금지합니다**
- **데이터베이스 스키마 변경이 필요한 경우 반드시 백업 후 진행하세요**
- **개발/테스트 시에는 별도의 데이터베이스를 사용하세요**

## 보안 고려사항

- 환경 변수를 통한 민감한 정보 관리
- bcrypt를 사용한 비밀번호 암호화
- 세션 기반 인증
- SQL Injection 방지 (Prepared Statements)

## 라이선스

Private - Eden Language Academy