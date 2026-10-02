const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Routes mapped to /users and base
router.post('/register', userController.register);
router.post('/login', userController.login);
router.get('/:id', userController.getUserProfile);

module.exports = router;
