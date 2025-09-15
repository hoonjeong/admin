const db = require('../config/database');
const fs = require('fs');
const path = require('path');

/**
 * SMS 관련 테이블 초기화
 */
async function initSMSTables() {
    try {
        const connection = await db.getConnection();

        // SMS 발송 결과 테이블 생성 (Java 코드 구조와 정확히 일치)
        const createSmsResultTable = `
            CREATE TABLE IF NOT EXISTS sms_send_result_nine (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone VARCHAR(20) NOT NULL COMMENT '수신 전화번호',
                message TEXT NOT NULL COMMENT '발송 메시지 내용',
                type VARCHAR(10) NOT NULL COMMENT 'SMS 타입 (SMS/LMS)',
                result_code VARCHAR(10) DEFAULT '' COMMENT '발송 결과 코드',
                result_message TEXT COMMENT '발송 결과 메시지',
                cmid VARCHAR(50) DEFAULT '' COMMENT '발송 고유 ID',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '발송 시간',
                INDEX idx_phone (phone),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='SMS 발송 결과 테이블'
        `;

        // 인증번호 저장 테이블 생성
        const createVerificationTable = `
            CREATE TABLE IF NOT EXISTS verification_codes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone VARCHAR(20) NOT NULL COMMENT '전화번호',
                code VARCHAR(10) NOT NULL COMMENT '인증번호',
                purpose VARCHAR(20) NOT NULL DEFAULT 'signup' COMMENT '용도 (signup, password_reset 등)',
                is_verified BOOLEAN DEFAULT FALSE COMMENT '인증 완료 여부',
                expired_at TIMESTAMP NOT NULL COMMENT '만료 시간',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '생성 시간',
                verified_at TIMESTAMP NULL COMMENT '인증 완료 시간',
                INDEX idx_phone_purpose (phone, purpose),
                INDEX idx_expired_at (expired_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='인증번호 관리 테이블'
        `;

        await connection.execute(createSmsResultTable);
        await connection.execute(createVerificationTable);

        // 기존 테이블에 누락된 컬럼이 있는지 확인하고 추가
        try {
            await connection.execute(`
                ALTER TABLE sms_send_result_nine
                ADD COLUMN IF NOT EXISTS result_code VARCHAR(10) DEFAULT '' COMMENT '발송 결과 코드'
            `);
        } catch (e) {
            // 컬럼이 이미 존재하거나 다른 오류 - 무시
        }

        try {
            await connection.execute(`
                ALTER TABLE sms_send_result_nine
                ADD COLUMN IF NOT EXISTS cmid VARCHAR(50) DEFAULT '' COMMENT '발송 고유 ID'
            `);
        } catch (e) {
            // 컬럼이 이미 존재하거나 다른 오류 - 무시
        }

        connection.release();

        console.log('SMS 관련 테이블 초기화 완료');
        return true;
    } catch (error) {
        console.error('SMS 테이블 초기화 오류:', error);
        return false;
    }
}

/**
 * 인증번호 저장
 */
async function saveVerificationCode(phone, code, purpose = 'signup', expiredMinutes = 3) {
    try {
        const connection = await db.getConnection();

        // 기존 미인증 코드 만료 처리
        const expireOldCodes = `
            UPDATE verification_codes
            SET expired_at = NOW()
            WHERE phone = ? AND purpose = ? AND is_verified = FALSE AND expired_at > NOW()
        `;

        await connection.execute(expireOldCodes, [phone, purpose]);

        // 새 인증번호 저장
        const insertQuery = `
            INSERT INTO verification_codes (phone, code, purpose, expired_at)
            VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))
        `;

        await connection.execute(insertQuery, [phone, code, purpose, expiredMinutes]);

        connection.release();
        return true;
    } catch (error) {
        console.error('인증번호 저장 오류:', error);
        return false;
    }
}

/**
 * 인증번호 확인
 */
async function verifyCode(phone, code, purpose = 'signup') {
    try {
        const connection = await db.getConnection();

        const query = `
            SELECT id FROM verification_codes
            WHERE phone = ? AND code = ? AND purpose = ?
            AND is_verified = FALSE AND expired_at > NOW()
            ORDER BY created_at DESC LIMIT 1
        `;

        const [rows] = await connection.execute(query, [phone, code, purpose]);

        if (rows.length > 0) {
            // 인증 완료 처리
            const updateQuery = `
                UPDATE verification_codes
                SET is_verified = TRUE, verified_at = NOW()
                WHERE id = ?
            `;
            await connection.execute(updateQuery, [rows[0].id]);

            connection.release();
            return true;
        }

        connection.release();
        return false;
    } catch (error) {
        console.error('인증번호 확인 오류:', error);
        return false;
    }
}

module.exports = {
    initSMSTables,
    saveVerificationCode,
    verifyCode
};