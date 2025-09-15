const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.render('home/index', {
        title: '이든배움국어학원',
        page: 'home',
        userInfo: req.session.userInfo || null
    });
});

module.exports = router;