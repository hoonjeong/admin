/**
 * View tracking utility to prevent duplicate view count increments
 */

/**
 * Check if view should be counted based on session tracking
 * @param {Object} session - Express session object
 * @param {string} type - Type of content (post, faq, etc.)
 * @param {string} id - Content ID
 * @param {number} cooldownMs - Cooldown period in milliseconds (default: 5 minutes)
 * @returns {boolean} - True if view should be counted
 */
function shouldCountView(session, type, id, cooldownMs = 300000) {
    const sessionKey = `viewed${type.charAt(0).toUpperCase() + type.slice(1)}s`;

    if (!session[sessionKey]) {
        session[sessionKey] = {};
    }

    const viewKey = `${type}_${id}`;
    const lastViewed = session[sessionKey][viewKey];
    const now = Date.now();

    // Count view if never viewed or cooldown period has passed
    if (!lastViewed || (now - lastViewed) > cooldownMs) {
        session[sessionKey][viewKey] = now;
        return true;
    }

    return false;
}

/**
 * Increment view count if conditions are met
 * @param {Object} db - Database connection
 * @param {Object} session - Express session object
 * @param {string} type - Type of content (post, faq, etc.)
 * @param {string} id - Content ID
 * @param {string} tableName - Database table name
 * @param {number} cooldownMs - Cooldown period in milliseconds
 * @returns {boolean} - True if view was counted
 */
async function incrementViewCount(db, session, type, id, tableName, cooldownMs = 300000) {
    if (shouldCountView(session, type, id, cooldownMs)) {
        await db.execute(
            `UPDATE ${tableName} SET read_count = read_count + 1 WHERE id = ?`,
            [id]
        );
        return true;
    }
    return false;
}

module.exports = {
    shouldCountView,
    incrementViewCount
};