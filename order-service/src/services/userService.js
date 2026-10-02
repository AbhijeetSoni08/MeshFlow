const axios = require('axios');

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';

const getUser = async (userId, authHeader = null) => {
  try {
    const headers = {};
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    const response = await axios.get(`${USER_SERVICE_URL}/users/${userId}`, {
      headers,
      timeout: 5000
    });
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return null;
    }
    throw new Error(`User Service communication error: ${error.message}`);
  }
};

module.exports = {
  getUser,
  USER_SERVICE_URL
};
