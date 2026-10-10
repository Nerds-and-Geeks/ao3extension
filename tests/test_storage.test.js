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
  const searchUrl = 'https://archiveofourown.org/works/search?work_search%5Bfandom_names%5D=Fandom+A&work_search%5Brelationship_names%5D=Character+A%2FCharacter+B&work_search%5Bcharacter_names%5D=Character+A&work_search%5Bfreeform_names%5D=Alternate+Universe+-+Canon+Divergence&work_search%5Bexclude_work_tag_names%5D=Angst';
  const c1 = storage.parseAo3SearchUrl(searchUrl);

  assert.deepStrictEqual(c1.fandoms, ['Fandom A']);
  assert.deepStrictEqual(c1.relationships, ['Character A/Character B']);
  assert.deepStrictEqual(c1.characters, ['Character A']);
  assert.deepStrictEqual(c1.freeformTags, ['Alternate Universe - Canon Divergence']);
  assert.deepStrictEqual(c1.excludeTags, ['Angst']);
  console.log('  ✓ 1.1 parseAo3SearchUrl parses all standard search parameters');

  // Test 1.2: URL Parsing - Tag Page Path
  const tagUrl = 'https://archiveofourown.org/tags/Character%20A*s*Character%20B/works';
  const c2 = storage.parseAo3SearchUrl(tagUrl);
  assert(c2.relationships.includes('Character A/Character B') || c2.relationships.includes('Character A*s*Character B') || c2.freeformTags.length > 0);
  console.log('  ✓ 1.2 parseAo3SearchUrl handles /tags/ URL paths');

  // Test 1.3: Save Preset (Requirement 1)
  const preset1 = await storage.savePreset('Main Preset', searchUrl);
  assert.strictEqual(preset1.name, 'Main Preset');
  assert.strictEqual(preset1.url, searchUrl);
  assert.deepStrictEqual(preset1.criteria.relationships, ['Character A/Character B']);

  const state1 = await storage.loadPresets();
  assert.strictEqual(state1.presets.length, 1);
  assert.strictEqual(state1.activePresetId, preset1.id);
  console.log('  ✓ 1.3 savePreset creates preset object and sets activePresetId');

  // Test 1.4: Overwrite Preset (Requirement 2)
  const newSearchUrl = 'https://archiveofourown.org/works/search?work_search%5Bfandom_names%5D=Fandom+A&work_search%5Brelationship_names%5D=Character+A%2FCharacter+B%2C+Character+C%2FCharacter+B';
  const overwritten = await storage.overwritePreset(preset1.id, newSearchUrl);

  assert.strictEqual(overwritten.id, preset1.id);
  assert.strictEqual(overwritten.name, 'Main Preset');
  assert.deepStrictEqual(overwritten.criteria.relationships, ['Character A/Character B', 'Character C/Character B']);

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
  const filterTagUrl = 'https://archiveofourown.org/works?commit=Sort+and+Filter&tag_id=Fandom+A&page=2';
  const c3 = storage.parseAo3SearchUrl(filterTagUrl);
  assert(c3.fandoms.includes('Fandom A'), 'tag_id parameter must be parsed into fandoms list');
  console.log('  ✓ 1.6 parseAo3SearchUrl handles tag_id query parameter');

  // Test 1.7: Page Type Filtering (Exclude user profile/pseud pages and single work reader views)
  const userPseudUrl = 'https://archiveofourown.org/users/YodelingProspector/pseuds/YodelingProspector';
  const userProfileUrl = 'https://archiveofourown.org/users/YodelingProspector';
  const singleWorkUrl = 'https://archiveofourown.org/works/91487341';
  const validSearchUrl = 'https://archiveofourown.org/works/search?work_search%5Bfandom_names%5D=Fandom+A';

  assert.strictEqual(storage.isSearchOrFilterPage(userPseudUrl), false, 'User pseud pages must NOT be treated as search/filter pages');
  assert.strictEqual(storage.isSearchOrFilterPage(userProfileUrl), false, 'User profile pages must NOT be treated as search/filter pages');
  assert.strictEqual(storage.isSearchOrFilterPage(singleWorkUrl), false, 'Single work reader pages must NOT be treated as search/filter pages');
  assert.strictEqual(storage.isSearchOrFilterPage(validSearchUrl), true, 'Valid search result pages must be treated as search/filter pages');
  console.log('  ✓ 1.7 isSearchOrFilterPage correctly excludes non-search pages (user profiles, pseuds, single works)');
}

module.exports = testStorageSuite;
