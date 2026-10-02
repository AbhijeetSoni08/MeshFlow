const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'meshflow-secret-key-user-service-2026';

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

module.exports = {
  authenticateToken,
  JWT_SECRET
};
