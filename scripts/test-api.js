const http = require('http');

const baseURL = 'http://localhost:8000/api';
const headers = {
  'Authorization': 'Bearer larder_local_sync_8f92k',
  'Content-Type': 'application/json'
};

async function fetchAPI(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers,
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const res = await fetch(`${baseURL}${endpoint}`, options);
  if (!res.ok) {
    throw new Error(`API error ${res.status}`);
  }
  return await res.json();
}

async function runTests() {
  console.log("Running API Tests...");
  let passed = 0;
  let failed = 0;

  const test = async (name, fn) => {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`❌ FAIL: ${name}`, e);
      failed++;
    }
  };

  await test('GET /recipes', async () => {
    const data = await fetchAPI('/recipes');
    if (!Array.isArray(data)) throw new Error("Expected array");
  });

  await test('GET /mealplans', async () => {
    const data = await fetchAPI('/mealplans');
    if (!Array.isArray(data)) throw new Error("Expected array");
  });

  await test('GET /shoppinglists', async () => {
    const data = await fetchAPI('/shoppinglists');
    if (!Array.isArray(data)) throw new Error("Expected array");
  });

  await test('GET /pantry-items', async () => {
    const data = await fetchAPI('/pantry-items');
    if (!Array.isArray(data)) throw new Error("Expected array");
  });

  await test('GET /receipts', async () => {
    const data = await fetchAPI('/receipts');
    if (!Array.isArray(data)) throw new Error("Expected array");
  });

  await test('GET /consumption', async () => {
    const data = await fetchAPI('/consumption');
    if (!Array.isArray(data)) throw new Error("Expected array");
  });

  await test('GET /ingredients', async () => {
    const data = await fetchAPI('/ingredients');
    if (!Array.isArray(data)) throw new Error("Expected array");
  });

  await test('GET /household', async () => {
    const data = await fetchAPI('/household');
    if (!Array.isArray(data)) throw new Error("Expected array");
  });

  await test('GET /settings', async () => {
    const data = await fetchAPI('/settings');
    if (typeof data !== 'object') throw new Error("Expected object");
  });

  const today = new Date().toISOString().slice(0,10);
  
  await test('POST /shoppinglists/tick', async () => {
    await fetchAPI('/shoppinglists/tick', 'POST', { date: today, itemId: 'sli_1', checked: true });
  });

  await test('PUT /pantry-items', async () => {
    await fetchAPI('/pantry-items', 'PUT', [{ pantryId: 'test1', ingredientFoodId: 'test_food' }]);
  });
  
  await test('PUT /receipts', async () => {
    await fetchAPI('/receipts', 'PUT', [{ id: 'test1' }]);
  });
  
  await test('PUT /consumption', async () => {
    await fetchAPI('/consumption', 'PUT', [{ id: 'test1' }]);
  });

  console.log(`\nTests completed. Passed: ${passed}, Failed: ${failed}`);
}

runTests().catch(console.error);
