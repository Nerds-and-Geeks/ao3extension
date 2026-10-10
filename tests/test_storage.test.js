const assert = require('assert');
const storage = require('../lib/storage.js');

// Mock localStorage for headless Node testing
global.localStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = String(val); },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};

async function testStorageSuite() {
  console.log('\n--- 🧪 TEST SUITE 1: STORAGE & URL PARSING ---');
  localStorage.clear();

  // Test 1.1: URL Parsing - Search Page
  const searchUrl = 'https://archiveofourown.org/works/search?work_search%5Bfandom_names%5D=Superman+%28Movie+2025%29&work_search%5Brelationship_names%5D=Clark+Kent%2FLois+Lane&work_search%5Bcharacter_names%5D=Clark+Kent&work_search%5Bfreeform_names%5D=Alternate+Universe+-+Canon+Divergence&work_search%5Bexclude_work_tag_names%5D=Angst';
  const c1 = storage.parseAo3SearchUrl(searchUrl);

  assert.deepStrictEqual(c1.fandoms, ['Superman (Movie 2025)']);
  assert.deepStrictEqual(c1.relationships, ['Clark Kent/Lois Lane']);
  assert.deepStrictEqual(c1.characters, ['Clark Kent']);
  assert.deepStrictEqual(c1.freeformTags, ['Alternate Universe - Canon Divergence']);
  assert.deepStrictEqual(c1.excludeTags, ['Angst']);
  console.log('  ✓ 1.1 parseAo3SearchUrl parses all standard search parameters');

  // Test 1.2: URL Parsing - Tag Page Path
  const tagUrl = 'https://archiveofourown.org/tags/Clark%20Kent*s*Lois%20Lane/works';
  const c2 = storage.parseAo3SearchUrl(tagUrl);
  assert(c2.relationships.includes('Clark Kent/Lois Lane') || c2.relationships.includes('Clark Kent*s*Lois Lane') || c2.freeformTags.length > 0);
  console.log('  ✓ 1.2 parseAo3SearchUrl handles /tags/ URL paths');

  // Test 1.3: Save Preset (Requirement 1)
  const preset1 = await storage.savePreset('Superman Main', searchUrl);
  assert.strictEqual(preset1.name, 'Superman Main');
  assert.strictEqual(preset1.url, searchUrl);
  assert.deepStrictEqual(preset1.criteria.relationships, ['Clark Kent/Lois Lane']);

  const state1 = await storage.loadPresets();
  assert.strictEqual(state1.presets.length, 1);
  assert.strictEqual(state1.activePresetId, preset1.id);
  console.log('  ✓ 1.3 savePreset creates preset object and sets activePresetId');

  // Test 1.4: Overwrite Preset (Requirement 2)
  const newSearchUrl = 'https://archiveofourown.org/works/search?work_search%5Bfandom_names%5D=Superman+%28Movie+2025%29&work_search%5Brelationship_names%5D=Clark+Kent%2FLois+Lane%2C+Lex+Luthor%2FLois+Lane';
  const overwritten = await storage.overwritePreset(preset1.id, newSearchUrl);

  assert.strictEqual(overwritten.id, preset1.id);
  assert.strictEqual(overwritten.name, 'Superman Main');
  assert.deepStrictEqual(overwritten.criteria.relationships, ['Clark Kent/Lois Lane', 'Lex Luthor/Lois Lane']);

  const state2 = await storage.loadPresets();
  assert.strictEqual(state2.presets[0].criteria.relationships.length, 2);
  console.log('  ✓ 1.4 overwritePreset successfully updates existing preset criteria on top');

  // Test 1.5: Delete Preset
  await storage.deletePreset(preset1.id);
  const state3 = await storage.loadPresets();
  assert.strictEqual(state3.presets.length, 0);
  assert.strictEqual(state3.activePresetId, null);
  console.log('  ✓ 1.5 deletePreset removes preset and clears active state');

  // Test 1.6: URL Parsing - tag_id query parameter
  const filterTagUrl = 'https://archiveofourown.org/works?commit=Sort+and+Filter&tag_id=Superman+%28Movie+2025%29&page=2';
  const c3 = storage.parseAo3SearchUrl(filterTagUrl);
  assert(c3.fandoms.includes('Superman (Movie 2025)'), 'tag_id parameter must be parsed into fandoms list');
  console.log('  ✓ 1.6 parseAo3SearchUrl handles tag_id query parameter');
}

module.exports = testStorageSuite;
