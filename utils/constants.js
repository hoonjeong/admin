// 사용자 권한 코드
const USER_ROLES = {
    OWNER: 'O',      // 원장
    TEACHER: 'T',    // 선생님
    STUDENT: 'S',    // 학생
    ADMIN: 'A'       // 관리자
};

// 상태 코드
const STATUS = {
    ACTIVE: 1,       // 활성
    INACTIVE: 0,     // 비활성
    DELETED: -1      // 삭제됨
};

// HTTP 상태 코드
const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500
};

// 메시지
const MESSAGES = {
    LOGIN_SUCCESS: '로그인되었습니다.',
    LOGIN_FAILED: '아이디 또는 비밀번호가 일치하지 않습니다.',
    LOGOUT_SUCCESS: '로그아웃되었습니다.',
    UNAUTHORIZED: '로그인이 필요합니다.',
    FORBIDDEN: '접근 권한이 없습니다.',
    NOT_FOUND: '요청한 리소스를 찾을 수 없습니다.',
    SERVER_ERROR: '서버 오류가 발생했습니다.',
    DUPLICATE_ENTRY: '이미 등록된 데이터입니다.',
    INVALID_INPUT: '입력값이 올바르지 않습니다.',
    SUCCESS: '성공적으로 처리되었습니다.',
    FAILED: '처리 중 오류가 발생했습니다.'
};

// 요일 코드
const DAYS_OF_WEEK = {
    '월': 1,
    '화': 2,
    '수': 3,
    '목': 4,
    '금': 5,
    '토': 6,
    '일': 0
};

// 요일 이름 (숫자 -> 한글)
const DAYS_OF_WEEK_NAMES = {
    1: '월',
    2: '화',
    3: '수',
    4: '목',
    5: '금',
    6: '토',
    7: '일'
};

// 학년 구분
const GRADE_TYPES = {
    ELEMENTARY: '초',
    MIDDLE: '중',
    HIGH: '고'
};

// SMS 모드
const SMS_MODES = {
    TEST: 'Test',
    REAL: 'Real'
};

// 파일 카테고리
const FILE_CATEGORIES = {
    LECTURE: 'lecture',
    HOMEWORK: 'homework',
    NOTICE: 'notice',
    PROFILE: 'profile'
};

// 정규식 패턴
const PATTERNS = {
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    PHONE: /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/,
    KOREAN_NAME: /^[가-힣]{2,5}$/,
    PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{8,})/
};

// 기본값
const DEFAULTS = {
    PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
    SESSION_TIMEOUT: 30 * 60 * 1000, // 30분
    FILE_SIZE_LIMIT: 50 * 1024 * 1024, // 50MB
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_TIME: 15 * 60 * 1000 // 15분
};

// 게시글 카테고리 (config/constants.js에서 이전)
const POST_CATEGORIES = {
    'N': '공지사항',
    'S': '이든이야기',
    'C': '입시정보',
    'D': '입시자료',
    'R': '수강후기'
};

// 파일 업로드 제한 (config/constants.js에서 이전)
const FILE_LIMITS = {
    MAX_FILES: 10,
    MAX_SIZE: 50 * 1024 * 1024, // 50MB
    ALLOWED_TYPES: {
        IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        VIDEO: ['video/mp4', 'video/webm', 'video/ogg'],
        DOCUMENT: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    }
};

// 페이지네이션 (config/constants.js에서 이전)
const PAGINATION = {
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100
};

// 날짜 형식 (config/constants.js에서 이전)
const DATE_FORMATS = {
    SHORT: '%m/%d',
    FULL: '%Y-%m-%d %H:%i',
    DATE_ONLY: '%Y-%m-%d',
    TIME_ONLY: '%H:%i'
};

module.exports = {
    USER_ROLES,
    STATUS,
    HTTP_STATUS,
    MESSAGES,
    DAYS_OF_WEEK,
    DAYS_OF_WEEK_NAMES,
    GRADE_TYPES,
    SMS_MODES,
    FILE_CATEGORIES,
    PATTERNS,
    DEFAULTS,
    POST_CATEGORIES,
    FILE_LIMITS,
    PAGINATION,
    DATE_FORMATS
};