/**
 * MeshFlow End-to-End Flow Verification Script
 * Validates distributed order flow across User, Product, and Order services.
 */

const http = require('http');

const USER_SERVICE = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const PRODUCT_SERVICE = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';
const ORDER_SERVICE = process.env.ORDER_SERVICE_URL || 'http://localhost:3003';

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runE2E() {
  console.log('====================================================');
  console.log('       MeshFlow End-to-End Flow Verification        ');
  console.log('====================================================\n');

  try {
    // 1. Health checks
    console.log('[1/7] Checking health of all 3 services...');
    const [uHealth, pHealth, oHealth] = await Promise.all([
      request(`${USER_SERVICE}/health`),
      request(`${PRODUCT_SERVICE}/health`),
      request(`${ORDER_SERVICE}/health`)
    ]);

    if (uHealth.status !== 200 || pHealth.status !== 200 || oHealth.status !== 200) {
      throw new Error(`Health checks failed: User(${uHealth.status}), Product(${pHealth.status}), Order(${oHealth.status})`);
    }
    console.log('  ✔ User Service is UP (:3001)');
    console.log('  ✔ Product Service is UP (:3002)');
    console.log('  ✔ Order Service is UP (:3003)\n');

    // 2. User Registration & Login
    const uniqueEmail = `chef_${Date.now()}@meshflow.io`;
    console.log(`[2/7] Registering customer (${uniqueEmail})...`);
    const regRes = await request(`${USER_SERVICE}/users/register`, { method: 'POST' }, {
      name: 'Chef Gordon',
      email: uniqueEmail,
      password: 'SafePassword2026!'
    });

    if (regRes.status !== 201) {
      throw new Error(`Registration failed (${regRes.status}): ${JSON.stringify(regRes.data)}`);
    }
    const userId = regRes.data.user.id;
    console.log(`  ✔ Customer registered with User ID: ${userId}`);

    console.log('[3/7] Logging in to verify JWT issuance...');
    const loginRes = await request(`${USER_SERVICE}/users/login`, { method: 'POST' }, {
      email: uniqueEmail,
      password: 'SafePassword2026!'
    });
    if (loginRes.status !== 200 || !loginRes.data.token) {
      throw new Error(`Login failed (${loginRes.status}): ${JSON.stringify(loginRes.data)}`);
    }
    const token = loginRes.data.token;
    console.log('  ✔ Received JWT Bearer Token\n');

    // 3. Product Catalog
    console.log('[4/7] Querying product catalog...');
    const productsRes = await request(`${PRODUCT_SERVICE}/products`);
    if (productsRes.status !== 200 || !Array.isArray(productsRes.data) || productsRes.data.length === 0) {
      throw new Error(`Product catalog check failed (${productsRes.status})`);
    }
    const product = productsRes.data[0];
    console.log(`  ✔ Catalog loaded (${productsRes.data.length} items). Selected: "${product.name}" (Stock: ${product.stock}, Price: $${product.price})\n`);

    // 4. Create Order (Distributed Flow)
    console.log('[5/7] Placing an order via Order Service (Distributed Orchestration)...');
    const orderQty = 2;
    const orderRes = await request(
      `${ORDER_SERVICE}/orders`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      },
      {
        userId: userId,
        items: [{ productId: product.id, quantity: orderQty }]
      }
    );

    if (orderRes.status !== 201) {
      throw new Error(`Order placement failed (${orderRes.status}): ${JSON.stringify(orderRes.data)}`);
    }
    const orderId = orderRes.data.id;
    console.log(`  ✔ Order created successfully! ID: #${orderId}, Total: $${orderRes.data.totalAmount}, Status: ${orderRes.data.status}`);

    // 5. Verify Inventory Deduction
    console.log('[6/7] Verifying inventory deduction in Product Service...');
    const updatedProdRes = await request(`${PRODUCT_SERVICE}/products/${product.id}`);
    const expectedStock = product.stock - orderQty;
    if (updatedProdRes.data.stock !== expectedStock) {
      throw new Error(`Stock mismatch: expected ${expectedStock}, got ${updatedProdRes.data.stock}`);
    }
    console.log(`  ✔ Product stock accurately decremented from ${product.stock} to ${updatedProdRes.data.stock}\n`);

    // 6. Test Insufficient Stock Protection
    console.log('[7/7] Testing inventory protection against excessive order quantity...');
    const failOrderRes = await request(
      `${ORDER_SERVICE}/orders`,
      { method: 'POST' },
      {
        userId: userId,
        items: [{ productId: product.id, quantity: 9999 }]
      }
    );
    if (failOrderRes.status === 400 && failOrderRes.data.error.includes('Insufficient stock')) {
      console.log('  ✔ Correctly rejected excessive order quantity with 400 Bad Request');
    } else {
      throw new Error(`Expected 400 Insufficient stock, received: ${failOrderRes.status}`);
    }

    console.log('\n====================================================');
    console.log(' 🎉 ALL END-TO-END FLOW VERIFICATIONS PASSED!       ');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ E2E Verification Failed:', err.message);
    process.exit(1);
  }
}

runE2E();
