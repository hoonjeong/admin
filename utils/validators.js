/**
 * 이메일 유효성 검사
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * 전화번호 유효성 검사 및 포맷팅
 */
function formatPhoneNumber(phone) {
    if (!phone) return '';
    
    // 숫자만 추출
    const numbers = phone.replace(/[^0-9]/g, '');
    
    // 한국 전화번호 형식
    if (numbers.length === 11) {
        return numbers.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    } else if (numbers.length === 10) {
        return numbers.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    }
    
    return phone;
}

/**
 * 비밀번호 강도 검사
 */
function isStrongPassword(password) {
    // 최소 8자, 대소문자, 숫자, 특수문자 포함
    const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{8,})/;
    return strongRegex.test(password);
}

/**
 * 날짜 유효성 검사
 */
function isValidDate(dateString) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
}

/**
 * 파일 확장자 검사
 */
function isAllowedFileType(filename, allowedTypes = []) {
    if (allowedTypes.length === 0) {
        allowedTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif'];
    }
    
    const ext = filename.split('.').pop().toLowerCase();
    return allowedTypes.includes(ext);
}

/**
 * SQL Injection 방지용 문자열 정제
 */
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // 기본적인 SQL 인젝션 패턴 제거
    return input
        .replace(/['";\\]/g, '')
        .trim();
}

/**
 * 페이지 번호 유효성 검사
 */
function validatePageNumber(page) {
    const pageNum = parseInt(page, 10);
    return !isNaN(pageNum) && pageNum > 0 ? pageNum : 1;
}

/**
 * 입력 필드 검증
 */
function validateRequired(fields, data) {
    const errors = [];
    
    for (const field of fields) {
        if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
            errors.push(`${field} is required`);
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * 한글 이름 유효성 검사
 */
function isValidKoreanName(name) {
    const koreanNameRegex = /^[가-힣]{2,5}$/;
    return koreanNameRegex.test(name);
}

/**
 * YouTube URL 변환
 */
function convertToEmbedUrl(url) {
    if (!url) return null;
    
    let videoId = null;
    
    // YouTube 일반 URL
    if (url.includes('youtube.com/watch?v=')) {
        videoId = url.split('v=')[1]?.split('&')[0];
    } 
    // YouTube 단축 URL
    else if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1]?.split('?')[0];
    }
    // 이미 embed URL인 경우
    else if (url.includes('youtube.com/embed/')) {
        return url;
    }
    
    return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
}

module.exports = {
    isValidEmail,
    formatPhoneNumber,
    isStrongPassword,
    isValidDate,
    isAllowedFileType,
    sanitizeInput,
    validatePageNumber,
    validateRequired,
    isValidKoreanName,
    convertToEmbedUrl
};