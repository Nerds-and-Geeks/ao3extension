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
                <a href="/tags/Fandom%20A/works">Fandom A</a>
              </h5>
            </div>
            <ul class="tags commas">
              <li class="relationships"><a href="/tags/Character%20A*s*Character%20B">Character A/Character B</a></li>
              <li class="relationships"><a href="/tags/Character%20C*s*Character%20D">Character C/Character D</a></li>
              <li class="relationships"><a href="/tags/Character%20E*s*Character%20B">Character E/Character B</a></li>
              <li class="relationships"><a href="/tags/Character%20F*s*Character%20G">Character F/Character G</a></li>
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
                <a href="/tags/Fandom%20A/works">Fandom A</a>
              </h5>
            </div>
            <ul class="tags commas">
              <li class="relationships"><a href="/tags/Character%20A*s*Character%20B">Character A/Character B</a></li>
            </ul>
          </li>
        </ol>
      </div>
    </body>
    </html>
  `;

  const dom = new JSDOM(html, {
    url: 'https://archiveofourown.org/works/search?work_search%5Bfandom_names%5D=Fandom+A&work_search%5Brelationship_names%5D=Character+A%2FCharacter+B',
    runScripts: 'dangerously',
    resources: 'usable'
  });

  const window = dom.window;
  const document = window.document;

  // Polyfill localStorage & fetch in JSDOM
  window.localStorage = {
    store: {},
    getItem(key) { return this.store[key] || null; },
    setItem(key, val) { this.store[key] = String(val); },
    removeItem(key) { delete this.store[key]; }
  };

  const fetchedPageHtml = `
    <html><body><ol class="work index group">
      <li class="work id_103" id="work_103">
        <div class="header module">
          <h4 class="heading"><a href="/works/103">Fetched Page Story</a></h4>
          <h5 class="fandoms heading"><a href="/tags/Fandom%20A/works">Fandom A</a></h5>
        </div>
        <ul class="tags commas">
          <li class="relationships"><a href="/tags/Character%20A*s*Character%20B">Character A/Character B</a></li>
        </ul>
      </li>
    </ol></body></html>
  `;

  window.fetch = function(url) {
    return Promise.resolve({
      ok: true,
      text: function() { return Promise.resolve(fetchedPageHtml); }
    });
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

  // Test 3.1: Top Box Widget Injection (User directive: single consolidated top control box above search results)
  const topWidget = document.getElementById('ao3-companion-top-bar');
  assert(topWidget, 'Unified top box widget #ao3-companion-top-bar must be injected into DOM');
  const sidebarWidget = document.getElementById('ao3-companion-widget-container');
  assert.strictEqual(sidebarWidget, null, 'Sidebar widget must NOT be injected into sidebar');
  console.log('  ✓ 3.1 AO3 Companion top control box successfully injected directly above results (sidebar widget removed)');

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

  // Test 3.3: Re-ordering DOM Elements by Match Precision with Depth Selector
  const btnFetchSort = document.getElementById('ao3-btn-fetch-sort');
  const depthSelect = document.getElementById('ao3-sort-depth-select');
  assert(btnFetchSort, 'Fetch & Sort button must exist in top box widget');
  assert(depthSelect, 'Depth selector dropdown (1, 5, 10, 15, 20, 25, 30) must exist in top box widget');

  // Set depth to 1 (Current Page) and sort
  depthSelect.value = "1";
  btnFetchSort.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  // After click, work_102 (100% Exact Match) must be moved to first position in DOM!
  const firstWorkAfter = document.querySelector('ol.work.index > li.work');
  assert.strictEqual(firstWorkAfter.id, 'work_102', 'Work 102 (100% Exact Match) must be moved to the top of the search results');
  console.log('  ✓ 3.3 Clicking "🚀 Fetch & Sort Matches" with depth 1 successfully moved 100% Exact Match work straight to the top of the screen');

  // Test 3.4: Save Preset via Top Box Button (Requirement 1)
  const inputName = document.getElementById('ao3-preset-name-input');
  const btnSave = document.getElementById('ao3-btn-save-new');
  inputName.value = 'Fandom A Preset';

  btnSave.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 100));

  const state = await window.loadPresets();
  assert.strictEqual(state.presets.length, 1);
  assert.strictEqual(state.presets[0].name, 'Fandom A Preset');
  console.log('  ✓ 3.4 Saving preset via top box UI succeeds');

  // Test 3.5: Overwrite Preset via Top Box Button (Requirement 2)
  const btnOverwrite = document.getElementById('ao3-btn-overwrite-preset');
  assert(btnOverwrite, 'Overwrite button must be rendered when a preset is active');
  console.log('  ✓ 3.5 Overwrite button properly displayed for active preset');

  // Test 3.6: Multi-Page Prefetch & Sort with Depth Dropdown & Embedded Pagination
  depthSelect.value = "5";
  btnFetchSort.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 1000));

  const worksAfterMulti = document.querySelectorAll('ol.work.index > li.work');
  assert(worksAfterMulti.length >= 3, 'Multi-page prefetching must append prefetched works into DOM');

  // Verify pagination is embedded INSIDE #ao3-companion-top-bar
  const currentTopWidget = document.getElementById('ao3-companion-top-bar');
  const paginationBox = document.getElementById('ao3-companion-pagination-box');
  assert(paginationBox, '#ao3-companion-pagination-box must exist inside top bar widget');
  assert(currentTopWidget.contains(paginationBox), 'Pagination box must be contained inside active top bar widget #ao3-companion-top-bar');

  // Verify no outer legacy pagination bars exist outside top bar box
  const outerBars = document.querySelectorAll('.ao3-companion-custom-pagination');
  assert.strictEqual(outerBars.length, 0, 'No loose pagination bars must be injected outside the AO3 Companion top box');

  console.log(`  ✓ 3.6 Depth dropdown prefetching (5 pages) successfully fetched ${worksAfterMulti.length} stories with embedded top-box pagination`);

  // Test 3.7: Single Work Reader View (No HierarchyRequestError when firstChild is a Text node)
  const singleWorkHtml = `
    <!DOCTYPE html>
    <html><body>
      <div id="main">
        <div class="work id_91487341" id="work_91487341">
          
          <!-- Whitespace text node above child div -->
          <div>
            <h3>Single Work Reader Title</h3>
          </div>
        </div>
      </div>
    </body></html>
  `;
  const singleDom = new JSDOM(singleWorkHtml, { url: 'https://archiveofourown.org/works/91487341' });
  assert.doesNotThrow(() => {
    singleDom.window.eval(storageCode);
    singleDom.window.eval(scorerCode);
    singleDom.window.eval(contentCode);
  }, 'content.js must execute without throwing HierarchyRequestError on single work reader pages');
  console.log('  ✓ 3.7 Single work reader view handled safely without HierarchyRequestError');
}

module.exports = testDomSuite;
