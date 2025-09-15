const logger = require('./logger');

/**
 * 트랜잭션 래퍼 함수
 * @param {Object} db - 데이터베이스 연결 객체
 * @param {Function} callback - 트랜잭션 내에서 실행할 함수
 */
async function withTransaction(db, callback) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * 페이지네이션 헬퍼
 * @param {String} query - 기본 쿼리
 * @param {Array} params - 쿼리 파라미터
 * @param {Number} page - 현재 페이지
 * @param {Number} limit - 페이지당 항목 수
 */
function paginate(query, params = [], page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const paginatedQuery = `${query} LIMIT ? OFFSET ?`;
    const paginatedParams = [...params, limit, offset];
    
    return {
        query: paginatedQuery,
        params: paginatedParams,
        page,
        limit
    };
}

/**
 * WHERE 절 빌더
 * @param {Object} conditions - 조건 객체
 */
function buildWhereClause(conditions) {
    const clauses = [];
    const params = [];
    
    for (const [key, value] of Object.entries(conditions)) {
        if (value !== undefined && value !== null && value !== '') {
            if (Array.isArray(value)) {
                clauses.push(`${key} IN (${value.map(() => '?').join(', ')})`);
                params.push(...value);
            } else if (typeof value === 'object' && value.operator) {
                clauses.push(`${key} ${value.operator} ?`);
                params.push(value.value);
            } else {
                clauses.push(`${key} = ?`);
                params.push(value);
            }
        }
    }
    
    return {
        whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
        params
    };
}

/**
 * 배치 삽입 헬퍼
 * @param {Object} connection - DB 연결
 * @param {String} table - 테이블명
 * @param {Array} records - 삽입할 레코드들
 */
async function batchInsert(connection, table, records) {
    if (!records || records.length === 0) return [];
    
    const keys = Object.keys(records[0]);
    const placeholders = keys.map(() => '?').join(', ');
    const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
    
    const results = [];
    for (const record of records) {
        const values = keys.map(key => record[key]);
        const [result] = await connection.execute(query, values);
        results.push(result.insertId);
    }
    
    return results;
}

/**
 * Soft Delete 헬퍼
 * @param {Object} connection - DB 연결
 * @param {String} table - 테이블명
 * @param {Number} id - 삭제할 레코드 ID
 * @param {String} deleteField - soft delete 필드명 (기본: deleted_at)
 */
async function softDelete(connection, table, id, deleteField = 'deleted_at') {
    const query = `UPDATE ${table} SET ${deleteField} = NOW() WHERE id = ?`;
    const [result] = await connection.execute(query, [id]);
    return result.affectedRows > 0;
}

/**
 * 존재 여부 확인
 * @param {Object} connection - DB 연결
 * @param {String} table - 테이블명
 * @param {Object} conditions - 조건
 */
async function exists(connection, table, conditions) {
    const { whereClause, params } = buildWhereClause(conditions);
    const query = `SELECT COUNT(*) as count FROM ${table} ${whereClause}`;
    const [rows] = await connection.execute(query, params);
    return rows[0].count > 0;
}

module.exports = {
    withTransaction,
    paginate,
    buildWhereClause,
    batchInsert,
    softDelete,
    exists
};