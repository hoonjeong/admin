const axios = require('axios');
const FormData = require('form-data');
const logger = require('./logger');

/**
 * SMS 발송 함수 (제공된 Java 코드 기반으로 완전 재작성)
 * @param {string} phone - 발송 대상 번호 (예: "01012345678")
 * @param {string} message - 메시지 내용
 * @param {string} callNum - 발신번호 (환경변수 SMS_CALL_NUMBER 기본값 사용)
 * @returns {Promise<string>} - 발송 결과
 */
async function sendSMS(phone, message, callNum) {
    const config = require('../config');
    const { userId: sUserid, authKey, callNum: defaultCallNum, mode: sMode, apiUrl } = config.sms;

    if (!sUserid || !authKey) {
        logger.warn('SMS 환경변수 미설정, 테스트 모드로 동작:', { sUserid: !!sUserid, authKey: !!authKey, sMode });
        // 테스트 모드에서는 SMS 발송을 시뮬레이션
        if (sMode === 'Test') {
            return '테스트 모드: SMS 발송 시뮬레이션 성공';
        }
        throw new Error('SMS_USER_ID 및 SMS_AUTH_KEY 환경변수가 설정되지 않았습니다.');
    }

    callNum = callNum || defaultCallNum;
    const sendMsg = message;
    const destNum = phone;

    // 메시지 길이에 따른 타입 결정 (80byte 기준)
    const messageBytes = Buffer.byteLength(message, 'utf8');
    const sType = messageBytes > 80 ? 'LMS' : 'SMS';

    const formData = new FormData();
    formData.append('sUserid', sUserid);
    formData.append('authKey', authKey);
    formData.append('sendMsg', sendMsg);
    formData.append('destNum', destNum);
    formData.append('callNum', callNum);
    formData.append('sMode', sMode);
    formData.append('sType', sType);

    let resultString = null;

    try {
        const response = await axios.post(apiUrl, formData, {
            headers: formData.getHeaders(),
            timeout: 10000
        });

        resultString = response.data;

        // SMS 발송 결과를 데이터베이스에 저장 (Java 코드와 동일한 구조)
        const SmsSendResult = {
            phone: destNum,
            message: sendMsg,
            type: sType,
            result_code: '',
            result_message: resultString,
            cmid: ''
        };

        await insertSmsSendResult(SmsSendResult);

        return resultString;

    } catch (error) {
        logger.error('SMS 발송 오류:', error);

        // 오류 발생 시에도 결과 저장
        const SmsSendResult = {
            phone: destNum,
            message: sendMsg,
            type: sType,
            result_code: '',
            result_message: error.message,
            cmid: ''
        };

        await insertSmsSendResult(SmsSendResult);

        throw error;
    }
}

/**
 * SMS 발송 결과를 데이터베이스에 저장 (Java 코드의 insertSmsSendResultNine 재현)
 */
async function insertSmsSendResult(sendResult) {
    try {

        const db = require('../config/database');

        const query = `
            INSERT INTO sms_send_result_nine (phone, message, type, result_message, send_time)
            VALUES (?, ?, ?, ?, NOW())
        `;

        // result_message가 너무 길 경우 잘라내기 (text 타입이므로 길이 제한 없음)
        const resultMessage = sendResult.result_message || '';
        const truncatedResultMessage = resultMessage.length > 1000
            ? resultMessage.substring(0, 997) + '...'
            : resultMessage;


        await db.execute(query, [
            sendResult.phone,
            sendResult.message,
            sendResult.type,
            truncatedResultMessage
        ]);
    } catch (error) {
        logger.error('SMS 발송 결과 저장 오류:', {
            error: error.message,
            code: error.code,
            sqlState: error.sqlState,
            sendResult: {
                phone: sendResult.phone,
                messageLength: sendResult.message ? sendResult.message.length : 0,
                type: sendResult.type
            }
        });
        logger.error('SMS 저장 오류 상세', error);
    }
}

/**
 * 인증번호 생성 함수
 * @param {number} length - 인증번호 길이 (기본값: 6)
 * @returns {string} - 생성된 인증번호
 */
function generateVerificationCode(length = 6) {
    const digits = '0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += digits[Math.floor(Math.random() * digits.length)];
    }
    return result;
}

/**
 * 회원가입 인증번호 발송
 */
async function sendVerificationSMS(phone) {
    const verificationCode = generateVerificationCode();
    const message = `[이든배움국어학원] 회원가입 인증번호: ${verificationCode}\n3분 이내에 입력해주세요.`;

    try {
        const result = await sendSMS(phone, message);
        return { success: true, verificationCode, result };
    } catch (error) {
        logger.error('SMS 발송 실패 상세:', { phone, error: error.message, stack: error.stack });
        return { success: false, error: error.message };
    }
}

/**
 * 인증번호를 데이터베이스에 저장
 */
async function saveVerificationCode(phone, code, type, expireMinutes) {
    try {
        const db = require('../config/database');

        // 기존 인증번호 삭제
        await db.execute(
            'DELETE FROM verification_codes WHERE phone = ? AND type = ?',
            [phone, type]
        );

        // 새 인증번호 저장
        await db.execute(
            'INSERT INTO verification_codes (phone, code, type, expires_at, created_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), NOW())',
            [phone, code, type, expireMinutes]
        );

    } catch (error) {
        logger.error('인증번호 저장 오류', error);
        throw error;
    }
}

/**
 * 인증번호 확인
 */
async function verifyCode(phone, code, type) {
    try {
        const db = require('../config/database');

        const [rows] = await db.execute(
            'SELECT * FROM verification_codes WHERE phone = ? AND code = ? AND type = ? AND expires_at > NOW()',
            [phone, code, type]
        );

        if (rows.length > 0) {
            // 인증 성공 시 해당 인증번호 삭제
            await db.execute(
                'DELETE FROM verification_codes WHERE phone = ? AND type = ?',
                [phone, type]
            );
            return true;
        }

        return false;
    } catch (error) {
        logger.error('인증번호 확인 오류', error);
        return false;
    }
}

module.exports = {
    sendSMS,
    sendVerificationSMS,
    generateVerificationCode,
    saveVerificationCode,
    verifyCode
};