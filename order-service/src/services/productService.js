const axios = require('axios');

const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';

const getProduct = async (productId) => {
  try {
    const response = await axios.get(`${PRODUCT_SERVICE_URL}/products/${productId}`, {
      timeout: 5000
    });
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return null;
    }
    throw new Error(`Product Service communication error: ${error.message}`);
  }
};

const adjustStock = async (productId, quantityChange) => {
  try {
    const response = await axios.patch(
      `${PRODUCT_SERVICE_URL}/products/${productId}/stock`,
      { quantityChange },
      { timeout: 5000 }
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(error.response.data.error || 'Failed to adjust product stock');
    }
    throw new Error(`Product Service stock update error: ${error.message}`);
  }
};

module.exports = {
  getProduct,
  adjustStock,
  PRODUCT_SERVICE_URL
};
