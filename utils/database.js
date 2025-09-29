async function getClassesWithStudentCount(db, whereClause = '', params = []) {
    const query = `
        SELECT 
            ci.*,
            COUNT(cs.id) as studentCount
        FROM class_info ci
        LEFT JOIN class_status cs ON ci.id = cs.class_id AND cs.status = 1
        ${whereClause}
        GROUP BY ci.id
        ORDER BY ci.day ASC, ci.hour ASC, ci.minute ASC
    `;
    
    const [rows] = await db.execute(query, params);
    return rows;
}


async function getPostsWithCommentCount(db, params = {}) {
    const { page = 1, limit = 20, search = '', category = '' } = params;
    const offset = (page - 1) * limit;
    
    let baseQuery = `
        FROM post_info p
        JOIN admin_user_info u ON u.id = p.user_id
        WHERE 1=1
    `;
    
    const queryParams = [];
    
    if (category) {
        baseQuery += ` AND p.category = ?`;
        queryParams.push(category);
    }
    
    if (search) {
        baseQuery += ` AND (p.subject LIKE ? OR p.contents LIKE ?)`;
        queryParams.push(`%${search}%`, `%${search}%`);
    }
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
    const [countResult] = await db.execute(countQuery, queryParams);
    const totalCount = countResult[0].total;
    
    // Get posts with pagination
    const postsQuery = `
        SELECT p.id, p.subject, p.category, p.read_count,
               DATE_FORMAT(p.insert_time, "%m/%d") as date,
               u.name as writer,
               SUBSTRING(p.contents, 1, 200) as content_preview
        ${baseQuery}
        ORDER BY p.id DESC
        LIMIT ? OFFSET ?
    `;
    queryParams.push(limit, offset);
    
    const [posts] = await db.execute(postsQuery, queryParams);
    
    // Get comment counts for all posts
    if (posts.length > 0) {
        const postIds = posts.map(p => p.id);
        const commentQuery = `
            SELECT post_id, COUNT(*) as count 
            FROM comment 
            WHERE post_id IN (${postIds.map(() => '?').join(',')})
            GROUP BY post_id
        `;
        const [commentCounts] = await db.execute(commentQuery, postIds);
        
        // Create a map for quick lookup
        const commentMap = {};
        commentCounts.forEach(cc => {
            commentMap[cc.post_id] = cc.count;
        });
        
        // Add comment count to each post
        posts.forEach(post => {
            post.commentCount = commentMap[post.id] || 0;
        });
    }
    
    return {
        posts,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
    };
}

async function getPostWithDetails(db, postId, session = null) {
    const connection = await db.getConnection();

    try {
        // 조회수 증가 처리
        if (session) {
            // 세션이 있는 경우 중복 방지 로직 적용
            const { incrementViewCount } = require('./viewTracker');
            await incrementViewCount(connection, session, 'post', postId, 'post_info');
        } else {
            // 세션이 없는 경우 기존 로직 유지 (관리자용)
            await connection.execute(
                'UPDATE post_info SET read_count = read_count + 1 WHERE id = ?',
                [postId]
            );
        }

        // Get post details
        const [posts] = await connection.execute(
            `SELECT p.*, u.name as writer,
                    DATE_FORMAT(p.insert_time, "%Y-%m-%d %H:%i") as formatted_date
             FROM post_info p
             JOIN admin_user_info u ON u.id = p.user_id
             WHERE p.id = ?`,
            [postId]
        );
        
        if (posts.length === 0) {
            return null;
        }
        
        const post = posts[0];
        
        // Get attachments
        const [files] = await connection.execute(
            `SELECT f.* FROM file_info f
             JOIN post_file_status pfs ON f.id = pfs.file_id
             WHERE pfs.post_id = ?`,
            [postId]
        );

        // Get comments
        const [comments] = await connection.execute(
            `SELECT c.*, DATE_FORMAT(c.insert_time, "%Y-%m-%d %H:%i") as formatted_date
             FROM comment c
             WHERE c.post_id = ?
             ORDER BY c.id DESC`,
            [postId]
        );
        
        return {
            post,
            files,
            comments
        };
    } finally {
        connection.release();
    }
}

async function deletePostWithFiles(db, postId) {
    const connection = await db.getConnection();
    const fs = require('fs');
    
    try {
        await connection.beginTransaction();
        
        // Get file paths before deletion
        const [files] = await connection.execute(
            `SELECT f.filepath FROM file_info f
             JOIN post_file_status pfs ON f.id = pfs.file_id
             WHERE pfs.post_id = ?`,
            [postId]
        );
        
        // Delete physical files
        for (const file of files) {
            if (fs.existsSync(file.filepath)) {
                fs.unlinkSync(file.filepath);
            }
        }
        
        // Delete database records
        await connection.execute('DELETE FROM comment WHERE post_id = ?', [postId]);
        await connection.execute('DELETE FROM post_file_status WHERE post_id = ?', [postId]);
        await connection.execute('DELETE FROM post_info WHERE id = ?', [postId]);
        
        await connection.commit();
        return true;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    getClassesWithStudentCount,
    getPostsWithCommentCount,
    getPostWithDetails,
    deletePostWithFiles
};