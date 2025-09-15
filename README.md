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
├── config/          # 설정 파일
│   └── database.js  # DB 연결 설정
├── middleware/      # 미들웨어
│   └── auth.js      # 인증 미들웨어
├── routes/          # 라우터
│   ├── admin.js     # 관리자 라우터
│   ├── auth.js      # 인증 라우터
│   └── teacher.js   # 선생님 라우터
├── views/           # EJS 템플릿
│   ├── admin/       # 관리자 페이지
│   ├── auth/        # 인증 페이지
│   ├── teacher/     # 선생님 페이지
│   └── partials/    # 공통 컴포넌트
├── public/          # 정적 파일
├── app.js           # 메인 애플리케이션
├── package.json     # 프로젝트 설정
└── .env.example     # 환경변수 예제
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

## 보안 고려사항

- 환경 변수를 통한 민감한 정보 관리
- bcrypt를 사용한 비밀번호 암호화
- 세션 기반 인증
- SQL Injection 방지 (Prepared Statements)

## 라이선스

Private - Eden Language Academy