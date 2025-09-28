const crypto = require('crypto');

/**
 * 비밀번호를 SHA1으로 해시화
 * @param {string} password - 해시화할 비밀번호
 * @returns {string} SHA1 해시된 비밀번호
 */
function hashPassword(password) {
    return crypto.createHash('sha1').update(password).digest('hex');
}

/**
 * 비밀번호 검증
 * @param {string} password - 입력된 비밀번호
 * @param {string} hashedPassword - 저장된 해시된 비밀번호
 * @returns {boolean} 비밀번호 일치 여부
 */
function verifyPassword(password, hashedPassword) {
    return hashPassword(password) === hashedPassword;
}

module.exports = {
    hashPassword,
    verifyPassword
};