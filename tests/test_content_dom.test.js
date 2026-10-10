const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

async function testDomSuite() {
  console.log('\n--- 🧪 TEST SUITE 3: DOM INTEGRATION & CONTENT SCRIPT ---');

  const html = `
    <!DOCTYPE html>
    <html>
    <head><title>AO3 Search Results</title></head>
    <body>
      <div id="main">
        <div id="sidebar"></div>
        <ol class="work index group">
          <!-- Work A: Diluted match (1 requested + 3 extra relationships) -->
          <li class="work id_101" id="work_101">
            <div class="header module">
              <h4 class="heading">
                <a href="/works/101">Diluted Story Title</a>
                by <a href="/users/author1">Author One</a>
              </h4>
              <h5 class="fandoms heading">
                <a href="/tags/Superman%20(Movie%202025)/works">Superman (Movie 2025)</a>
              </h5>
            </div>
            <ul class="tags commas">
              <li class="relationships"><a href="/tags/Clark%20Kent*s*Lois%20Lane">Clark Kent/Lois Lane</a></li>
              <li class="relationships"><a href="/tags/Bruce%20Wayne*s*Diana%20Prince">Bruce Wayne/Diana Prince</a></li>
              <li class="relationships"><a href="/tags/Lex%20Luthor*s*Lois%20Lane">Lex Luthor/Lois Lane</a></li>
              <li class="relationships"><a href="/tags/Jimmy%20Olsen*s*Lucy%20Lane">Jimmy Olsen/Lucy Lane</a></li>
            </ul>
          </li>

          <!-- Work B: Exact match (1 requested relationship only) -->
          <li class="work id_102" id="work_102">
            <div class="header module">
              <h4 class="heading">
                <a href="/works/102">Exact Story Title</a>
                by <a href="/users/author2">Author Two</a>
              </h4>
              <h5 class="fandoms heading">
                <a href="/tags/Superman%20(Movie%202025)/works">Superman (Movie 2025)</a>
              </h5>
            </div>
            <ul class="tags commas">
              <li class="relationships"><a href="/tags/Clark%20Kent*s*Lois%20Lane">Clark Kent/Lois Lane</a></li>
            </ul>
          </li>
        </ol>
      </div>
    </body>
    </html>
  `;

  const dom = new JSDOM(html, {
    url: 'https://archiveofourown.org/works/search?work_search%5Bfandom_names%5D=Superman+%28Movie+2025%29&work_search%5Brelationship_names%5D=Clark+Kent%2FLois+Lane',
    runScripts: 'dangerously',
    resources: 'usable'
  });

  const window = dom.window;
  const document = window.document;

  // Polyfill localStorage & chrome storage in JSDOM
  window.localStorage = {
    store: {},
    getItem(key) { return this.store[key] || null; },
    setItem(key, val) { this.store[key] = String(val); },
    removeItem(key) { delete this.store[key]; }
  };

  // Load scripts into JSDOM window
  const storageCode = fs.readFileSync(path.join(__dirname, '../lib/storage.js'), 'utf8');
  const scorerCode = fs.readFileSync(path.join(__dirname, '../lib/precision-scorer.js'), 'utf8');
  const contentCode = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8');

  window.eval(storageCode);
  window.eval(scorerCode);
  window.eval(contentCode);

  // Wait for DOM promises to settle
  await new Promise(r => setTimeout(r, 200));

  // Test 3.1: Sidebar Injection
  const widget = document.getElementById('ao3-companion-widget-container');
  assert(widget, 'Sidebar widget must be injected into DOM');
  console.log('  ✓ 3.1 AO3 Companion sidebar widget successfully injected into DOM');

  // Test 3.2: Badge Injection on Work Elements
  const work101Heading = document.querySelector('#work_101 h4.heading');
  const work102Heading = document.querySelector('#work_102 h4.heading');

  const badge101 = work101Heading.querySelector('.ao3-precision-badge');
  const badge102 = work102Heading.querySelector('.ao3-precision-badge');

  assert(badge101, 'Work 101 must have a precision badge');
  assert(badge102, 'Work 102 must have a precision badge');

  assert(badge102.textContent.includes('100% Exact Match'), 'Exact match work must display 100% Exact Match badge');
  assert(!badge101.textContent.includes('100% Exact Match'), 'Diluted work must not display 100% Exact Match badge');
  console.log(`  ✓ 3.2 Badges correctly attached to work headers (Exact: "${badge102.textContent}", Diluted: "${badge101.textContent}")`);

  // Test 3.3: Re-ordering DOM Elements by Match Precision
  const btnSort = document.getElementById('ao3-btn-sort-precision');
  assert(btnSort, 'Prioritize Most Matches button must exist in widget');

  // Initially, work_101 is first in DOM
  const firstWorkBefore = document.querySelector('ol.work.index > li.work');
  assert.strictEqual(firstWorkBefore.id, 'work_101');

  // Click sort button
  btnSort.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  // After click, work_102 (100% Exact Match) must be moved to first position in DOM!
  const firstWorkAfter = document.querySelector('ol.work.index > li.work');
  assert.strictEqual(firstWorkAfter.id, 'work_102', 'Work 102 (100% Exact Match) must be moved to the top of the search results');
  console.log('  ✓ 3.3 Clicking "⚡ Prioritize Most Matches" successfully moved 100% Exact Match work straight to the top of the screen');

  // Test 3.4: Save Preset via Widget Button (Requirement 1)
  const inputName = document.getElementById('ao3-preset-name-input');
  const btnSave = document.getElementById('ao3-btn-save-new');
  inputName.value = 'Superman Canon Divergence';

  btnSave.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 100));

  const state = await window.loadPresets();
  assert.strictEqual(state.presets.length, 1);
  assert.strictEqual(state.presets[0].name, 'Superman Canon Divergence');
  console.log('  ✓ 3.4 Saving preset via widget UI succeeds');

  // Test 3.5: Overwrite Preset via Widget Button (Requirement 2)
  const btnOverwrite = document.getElementById('ao3-btn-overwrite-preset');
  assert(btnOverwrite, 'Overwrite button must be rendered when a preset is active');
  console.log('  ✓ 3.5 Overwrite button properly displayed for active preset');
}

module.exports = testDomSuite;
