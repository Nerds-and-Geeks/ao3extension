/**
 * AO3 Companion - Content Script
 */

(function() {
  'use strict';

  var currentPresets = [];
  var activePresetId = null;
  var activePresetObj = null;

  // Sorted Pagination State
  var sortedDataSet = [];
  var currentSortedPage = 1;
  var sortedPageSize = 20;

  var currentPenaltyConfig = null;
  var currentBlockedAuthors = [];

  // Initialize extension on page load
  function init() {
    var checkFn = typeof isSearchOrFilterPage === 'function' ? isSearchOrFilterPage : (typeof window.isSearchOrFilterPage === 'function' ? window.isSearchOrFilterPage : function() { return true; });
    if (!checkFn(window.location.href)) {
      return;
    }

    loadPresetsState().then(function() {
      injectTopBarWidget();
      applyPrecisionScoring();
    });

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function(changes, namespace) {
        if (namespace === 'local' && (changes.ao3_penalty_config || changes.ao3_active_preset_id || changes.ao3_presets_v2 || changes.ao3_blocked_authors)) {
          if (!checkFn(window.location.href)) return;
          loadPresetsState().then(function() {
            injectTopBarWidget();
            applyPrecisionScoring();
          });
        }
      });
    }
  }

  function loadPresetsState() {
    var fnPresets = typeof window !== 'undefined' && typeof window.loadPresets === 'function' ? window.loadPresets : (typeof loadPresets === 'function' ? loadPresets : null);
    var fnConfig = typeof window !== 'undefined' && typeof window.loadPenaltyConfig === 'function' ? window.loadPenaltyConfig : (typeof loadPenaltyConfig === 'function' ? loadPenaltyConfig : null);
    var fnBlocked = typeof window !== 'undefined' && typeof window.loadBlockedAuthors === 'function' ? window.loadBlockedAuthors : (typeof loadBlockedAuthors === 'function' ? loadBlockedAuthors : null);

    var pPresets = fnPresets ? fnPresets() : Promise.resolve({ presets: [], activePresetId: null });
    var pConfig = fnConfig ? fnConfig() : Promise.resolve(null);
    var pBlocked = fnBlocked ? fnBlocked() : Promise.resolve([]);

    return Promise.all([pPresets, pConfig, pBlocked]).then(function(results) {
      var state = results[0] || {};
      currentPenaltyConfig = results[1] || null;
      currentBlockedAuthors = results[2] || [];

      currentPresets = state.presets || [];
      activePresetId = state.activePresetId || null;
      activePresetObj = currentPresets.find(function(p) { return p.id === activePresetId; }) || null;
    });
  }

  function extractWorkAuthorsFromDom(workEl) {
    var authors = [];
    var links = workEl.querySelectorAll('h4.heading a, .header a, .byline a, a[rel="author"]');
    links.forEach(function(a) {
      var href = a.getAttribute('href') || a.href || '';
      if (href.indexOf('/users/') >= 0 && a.textContent) {
        authors.push(a.textContent.trim());
      }
    });
    return Array.from(new Set(authors));
  }

  /**
   * Extracts tags from an AO3 work DOM element
   */
  function extractWorkDetailsFromDom(workEl) {
    var fandoms = [];
    var relationships = [];
    var characters = [];
    var freeformTags = [];

    // Fandoms
    var fandomEls = workEl.querySelectorAll('.fandoms a, h4.heading a[href*="/tags/"]');
    fandomEls.forEach(function(a) {
      if (a.textContent) fandoms.push(a.textContent.trim());
    });

    // Relationships
    var relEls = workEl.querySelectorAll('ul.tags li.relationships a');
    relEls.forEach(function(a) {
      if (a.textContent) relationships.push(a.textContent.trim());
    });

    // Characters
    var charEls = workEl.querySelectorAll('ul.tags li.characters a');
    charEls.forEach(function(a) {
      if (a.textContent) characters.push(a.textContent.trim());
    });

    // Freeform
    var freeEls = workEl.querySelectorAll('ul.tags li.freeforms a');
    freeEls.forEach(function(a) {
      if (a.textContent) freeformTags.push(a.textContent.trim());
    });

    return {
      fandoms: Array.from(new Set(fandoms)),
      relationships: Array.from(new Set(relationships)),
      characters: Array.from(new Set(characters)),
      freeformTags: Array.from(new Set(freeformTags))
    };
  }

  function getActiveCriteria() {
    var criteria = null;
    if (activePresetObj && activePresetObj.criteria) {
      criteria = activePresetObj.criteria;
    } else if (typeof parseAo3SearchUrl === 'function') {
      criteria = parseAo3SearchUrl(window.location.href);
    }

    if (criteria && (!criteria.fandoms || criteria.fandoms.length === 0)) {
      var headerEl = document.querySelector('h2.heading a, h2.fandom.heading a, .fandom.heading a');
      if (headerEl && headerEl.textContent) {
        var headerFandom = headerEl.textContent.trim();
        if (headerFandom) {
          criteria.fandoms = [headerFandom];
        }
      }
    }
    return criteria;
  }

  /**
   * Detects total available pages and total works count from AO3 pagination links or heading text
   */
  function detectMaxAvailablePages() {
    var maxPage = 1;
    var totalWorksCount = 0;

    // Check pagination links
    var pageLinks = document.querySelectorAll('ol.pagination li a, ul.pagination li a');
    pageLinks.forEach(function(a) {
      var text = a.textContent.trim();
      if (/^\d+$/.test(text)) {
        var num = parseInt(text, 10);
        if (num > maxPage) maxPage = num;
      }
    });

    // Check headings for total works count (e.g. "1 - 20 of 638 Works")
    var headings = document.querySelectorAll('h2.heading, h3.heading, .heading, header.module h2');
    headings.forEach(function(h) {
      if (h && h.textContent && !totalWorksCount) {
        var match = h.textContent.match(/(?:of\s+)?([\d,]+)\s+Works/i);
        if (match && match[1]) {
          var count = parseInt(match[1].replace(/,/g, ''), 10);
          if (count > 0) {
            totalWorksCount = count;
            var calcPage = Math.ceil(count / 20);
            if (calcPage > maxPage) maxPage = calcPage;
          }
        }
      }
    });

    if (!totalWorksCount && maxPage > 1) {
      totalWorksCount = maxPage * 20;
    }

    return {
      totalPages: Math.max(1, maxPage),
      totalWorks: totalWorksCount
    };
  }

  /**
   * Calculates & displays precision badges for all works on the page
   */
  function applyPrecisionScoring(contextDoc) {
    if (!contextDoc) {
      var checkFn = typeof isSearchOrFilterPage === 'function' ? isSearchOrFilterPage : (typeof window.isSearchOrFilterPage === 'function' ? window.isSearchOrFilterPage : function() { return true; });
      if (!checkFn(window.location.href)) return;
    }
    var doc = contextDoc || document;
    var criteria = getActiveCriteria();

    var works = doc.querySelectorAll('ol.work.index > li.work, ul.work.index > li.work, ol.index.group > li.index.group, div.work');

    works.forEach(function(workEl) {
      // Check Blocked Authors
      var authors = extractWorkAuthorsFromDom(workEl);
      var isBlocked = authors.some(function(author) {
        return currentBlockedAuthors.some(function(b) {
          return b.toLowerCase() === author.toLowerCase();
        });
      });

      if (isBlocked) {
        workEl.style.display = 'none';
        workEl.classList.add('ao3-work-blocked');
        return;
      } else {
        if (workEl.classList.contains('ao3-work-blocked')) {
          workEl.style.display = '';
          workEl.classList.remove('ao3-work-blocked');
        }
      }

      var workTags = extractWorkDetailsFromDom(workEl);
      var scoreResult = { scorePercent: 100, label: '100%' };

      if (typeof PrecisionScorer !== 'undefined' && PrecisionScorer.calculatePrecisionScore) {
        scoreResult = PrecisionScorer.calculatePrecisionScore(workTags, criteria, currentPenaltyConfig);
      }

      workEl.dataset.precisionScore = scoreResult.scorePercent;

      // Remove existing badge if present
      var oldBadge = workEl.querySelector('.ao3-precision-badge');
      if (oldBadge) oldBadge.remove();

      // Create new badge - ensure heading is a valid Element node (nodeType 1)
      var heading = workEl.querySelector('h4.heading, h3.heading, h2.heading, header') || workEl.querySelector('.header') || workEl.firstElementChild;
      if (heading && heading.nodeType === 1 && typeof heading.appendChild === 'function') {
        var badge = document.createElement('span');
        badge.className = 'ao3-precision-badge';
        if (scoreResult.scorePercent === 100) badge.classList.add('exact');
        else if (scoreResult.scorePercent >= 75) badge.classList.add('high');
        else if (scoreResult.scorePercent >= 40) badge.classList.add('partial');
        else badge.classList.add('diluted');

        badge.textContent = scoreResult.label;
        heading.appendChild(badge);
      }
    });
  }

  /**
   * Renders a specific page from the sorted dataset
   */
  function renderSortedPage(pageNumber) {
    if (sortedDataSet.length === 0) return;

    var container = document.querySelector('ol.work.index, ul.work.index, ol.index.group');
    if (!container) return;

    var totalPages = Math.ceil(sortedDataSet.length / sortedPageSize);
    pageNumber = Math.max(1, Math.min(pageNumber, totalPages));
    currentSortedPage = pageNumber;

    var startIndex = (pageNumber - 1) * sortedPageSize;
    var endIndex = startIndex + sortedPageSize;
    var pageWorks = sortedDataSet.slice(startIndex, endIndex);

    // Render works for target page
    container.innerHTML = '';
    pageWorks.forEach(function(workEl) {
      container.appendChild(workEl);
    });

    // Inject custom extension pagination controls INSIDE top bar box
    renderCustomPaginationBars(totalPages, pageNumber);
  }

  /**
   * Injects Custom Extension Pagination controls INSIDE the AO3 Companion Top Box
   */
  function renderCustomPaginationBars(totalPages, activePage) {
    // Remove any legacy outer pagination elements outside top bar
    var oldOuterBars = document.querySelectorAll('.ao3-companion-custom-pagination');
    oldOuterBars.forEach(function(el) { el.remove(); });

    var box = document.getElementById('ao3-companion-pagination-box');
    if (!box) return;

    if (totalPages <= 1) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }

    box.style.display = 'flex';
    box.style.alignItems = 'center';
    box.style.justifyContent = 'center';
    box.style.gap = '6px';
    box.style.flexWrap = 'wrap';

    var html = '<span style="font-weight: 700; font-size: 0.88em; color: #900000; margin-right: 8px;">Sorted Match Pages (Page ' + activePage + ' of ' + totalPages + ' • ' + sortedDataSet.length + ' Stories):</span>';

    // Previous Button
    if (activePage > 1) {
      html += '<button class="ao3-pag-btn" data-page="' + (activePage - 1) + '">« Prev</button>';
    }

    // Page numbers
    var maxPagesToShow = 10;
    var startPage = Math.max(1, activePage - 4);
    var endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    for (var p = startPage; p <= endPage; p++) {
      if (p === activePage) {
        html += '<span class="ao3-pag-current" style="padding: 5px 11px; background: #900000; color: #ffffff; font-weight: bold; border-radius: 4px;">' + p + '</span>';
      } else {
        html += '<button class="ao3-pag-btn" data-page="' + p + '">' + p + '</button>';
      }
    }

    // Next Button
    if (activePage < totalPages) {
      html += '<button class="ao3-pag-btn" data-page="' + (activePage + 1) + '">Next »</button>';
    }

    box.innerHTML = html;

    // Click event listener for pagination buttons
    box.querySelectorAll('.ao3-pag-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var targetPage = parseInt(btn.dataset.page, 10);
        renderSortedPage(targetPage);
        var worksList = document.querySelector('ol.work.index, ul.work.index, ol.index.group');
        if (worksList) {
          worksList.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  /**
   * Sorts current page works by precision score descending
   */
  function sortWorksByPrecision() {
    applyPrecisionScoring();

    var container = document.querySelector('ol.work.index, ul.work.index, ol.index.group');
    if (!container) return;

    var worksArray = Array.from(container.querySelectorAll(':scope > li.work, :scope > li.index.group'));
    if (worksArray.length === 0) return;

    worksArray.sort(function(a, b) {
      var scoreA = parseInt(a.dataset.precisionScore || '0', 10);
      var scoreB = parseInt(b.dataset.precisionScore || '0', 10);
      return scoreB - scoreA;
    });

    sortedDataSet = worksArray;
    renderSortedPage(1);

    updateSortButtonsText('✓ Sorted ' + worksArray.length + ' Stories on Page!', '#2e7d32');
  }

  /**
   * Multi-Page Prefetching & Sorting:
   * Sequentially fetches up to N pages of AO3 search results with rate-limit throttling,
   * handles HTTP 429 ("Retry Later") with automatic retry backoff, scores all works,
   * and renders custom sorted pagination controls inside top box.
   */
  function prefetchAndSortMultiPages(maxPagesToFetch) {
    var container = document.querySelector('ol.work.index, ul.work.index, ol.index.group');
    if (!container) return;

    var baseUrlStr = window.location.href;
    var urlsToFetch = [];

    for (var p = 2; p <= maxPagesToFetch; p++) {
      var pUrl = new URL(baseUrlStr);
      pUrl.searchParams.set('page', p.toString());
      urlsToFetch.push({ pageNum: p, url: pUrl.toString() });
    }

    var allWorksMap = new Map();

    // Add current page works first
    applyPrecisionScoring();
    var currentWorks = Array.from(container.querySelectorAll(':scope > li.work, :scope > li.index.group'));
    currentWorks.forEach(function(el, idx) {
      var key = el.id || ('work_current_' + idx);
      allWorksMap.set(key, el);
    });

    var delayMs = 150; // Polite delay between page requests to prevent AO3 429 "Retry later"

    function fetchNextPage(index) {
      if (index >= urlsToFetch.length) {
        finishAndRender();
        return;
      }

      var item = urlsToFetch[index];
      updateSortButtonsText('⏳ Prefetching page ' + item.pageNum + ' of ' + maxPagesToFetch + '...', '#ed6c02');

      fetchWithRetry(item.url, 0)
        .then(function(htmlText) {
          if (htmlText) {
            var parser = new DOMParser();
            var doc = parser.parseFromString(htmlText, 'text/html');
            applyPrecisionScoring(doc);
            var fetchedWorks = doc.querySelectorAll('ol.work.index > li.work, ul.work.index > li.work, ol.index.group > li.index.group, div.work');

            fetchedWorks.forEach(function(wEl, idx) {
              var key = wEl.id || ('work_fetched_' + item.url + '_' + idx);
              if (!allWorksMap.has(key)) {
                var importedEl = document.importNode(wEl, true);
                allWorksMap.set(key, importedEl);
              }
            });
          }

          // Delay before next page request to honor AO3 server rate limits
          setTimeout(function() {
            fetchNextPage(index + 1);
          }, delayMs);
        })
        .catch(function(err) {
          console.warn('Failed to prefetch page:', item.url, err);
          setTimeout(function() {
            fetchNextPage(index + 1);
          }, delayMs);
        });
    }

    function fetchWithRetry(url, retryCount) {
      var maxRetries = 2;
      return fetch(url, { headers: { 'Accept': 'text/html' } })
        .then(function(res) {
          if (res.status === 429) { // AO3 "Retry later" / Too Many Requests
            if (retryCount < maxRetries) {
              updateSortButtonsText('⚠️ AO3 rate limit! Waiting 3s...', '#d32f2f');
              return new Promise(function(resolve) {
                setTimeout(function() {
                  resolve(fetchWithRetry(url, retryCount + 1));
                }, 3000);
              });
            } else {
              console.warn('AO3 rate limit (429) persistent for URL:', url);
              return '';
            }
          }
          if (!res.ok) return '';
          return res.text();
        });
    }

    function finishAndRender() {
      var combinedWorks = Array.from(allWorksMap.values());

      combinedWorks.sort(function(a, b) {
        var scoreA = parseInt(a.dataset.precisionScore || '0', 10);
        var scoreB = parseInt(b.dataset.precisionScore || '0', 10);
        return scoreB - scoreA;
      });

      sortedDataSet = combinedWorks;
      renderSortedPage(1);

      updateSortButtonsText('✓ Prefetched & Ranked ' + combinedWorks.length + ' Stories!', '#2e7d32');
    }

    fetchNextPage(0);
  }

  function updateSortButtonsText(text, bg) {
    var sortBtns = document.querySelectorAll('#ao3-btn-fetch-sort');
    sortBtns.forEach(function(btn) {
      var origText = btn.dataset.origText || btn.textContent;
      btn.dataset.origText = origText;
      btn.textContent = text;
      if (bg) btn.style.backgroundColor = bg;
      setTimeout(function() {
        btn.textContent = origText;
        btn.style.backgroundColor = '';
      }, 4000);
    });
  }

  /**
   * Injects the Unified Top Control Box directly above search results
   */
  function injectTopBarWidget() {
    var existingBar = document.getElementById('ao3-companion-top-bar');
    if (existingBar) existingBar.remove();

    var checkFn = typeof isSearchOrFilterPage === 'function' ? isSearchOrFilterPage : (typeof window.isSearchOrFilterPage === 'function' ? window.isSearchOrFilterPage : function() { return true; });
    if (!checkFn(window.location.href)) return;

    var worksList = document.querySelector('ol.work.index, ul.work.index, ol.index.group');
    if (!worksList) return;

    var pageInfo = detectMaxAvailablePages();
    var detectedMax = pageInfo.totalPages;
    var totalWorks = pageInfo.totalWorks;

    var topWidget = document.createElement('div');
    topWidget.id = 'ao3-companion-top-bar';
    topWidget.className = 'ao3-companion-widget';
    topWidget.style.marginBottom = '16px';

    var html = '<h3>';
    html += '<span>AO3 Companion</span>';
    if (activePresetObj) {
      html += '<span style="font-size:0.8em; font-weight:normal; color:#1b5e20; background:#eaf6ec; border:1px solid #9bd6a7; padding:3px 10px; border-radius:12px;">Active Preset: <strong>' + escapeHtml(activePresetObj.name) + '</strong></span>';
    }
    html += '</h3>';

    // Active Preset Action Row
    if (activePresetObj) {
      html += '<div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;">';
      html += '<button id="ao3-btn-overwrite-preset" class="ao3-companion-btn ao3-companion-btn-success" style="width:auto; margin-bottom:0;">💾 Save Current Search on Top (' + escapeHtml(activePresetObj.name) + ')</button>';
      html += '<button id="ao3-btn-clear-active" class="ao3-companion-btn ao3-companion-btn-secondary" style="width:auto; margin-bottom:0;">❌ Clear Active Preset</button>';
      html += '</div>';
    }

    // Save & Load Row
    html += '<div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; margin-bottom:12px;">';
    
    html += '<div style="flex:1; min-width:240px;">';
    html += '<label for="ao3-preset-name-input" style="font-weight:600; font-size:0.85em; display:block; margin-bottom:4px; color:#444;">Save Current Search as Preset:</label>';
    html += '<div style="display:flex; gap:6px;">';
    html += '<input type="text" id="ao3-preset-name-input" class="ao3-companion-input" placeholder="e.g. Character A/Character B Canon Divergence" style="margin-bottom:0;" />';
    html += '<button id="ao3-btn-save-new" class="ao3-companion-btn" style="width:auto; white-space:nowrap; margin-bottom:0;">⭐ Save Preset</button>';
    html += '</div>';
    html += '</div>';

    if (currentPresets.length > 0) {
      html += '<div style="flex:1; min-width:240px;">';
      html += '<label for="ao3-preset-select" style="font-weight:600; font-size:0.85em; display:block; margin-bottom:4px; color:#444;">Load Saved Preset (' + currentPresets.length + '):</label>';
      html += '<div style="display:flex; gap:6px;">';
      html += '<select id="ao3-preset-select" class="ao3-companion-select" style="margin-bottom:0;">';
      html += '<option value="">-- Select Preset --</option>';
      currentPresets.forEach(function(p) {
        var selected = (p.id === activePresetId) ? ' selected' : '';
        html += '<option value="' + escapeHtml(p.id) + '"' + selected + '>' + escapeHtml(p.name) + '</option>';
      });
      html += '</select>';
      html += '<button id="ao3-btn-load-preset" class="ao3-companion-btn ao3-companion-btn-secondary" style="width:auto; white-space:nowrap; margin-bottom:0;">🚀 Load</button>';
      html += '</div>';
      html += '</div>';
    }

    html += '</div>';

    // Streamlined Precision Match Sorting Controls (Dropdown + Fetch & Sort Button)
    html += '<div style="display:flex; gap:8px; align-items:center; border-top:1px dashed #d0d0d0; padding-top:12px; flex-wrap:wrap;">';
    html += '<span style="font-weight:700; font-size:0.9em; color:#6200ee; margin-right:auto;">🎯 Precision Match Sorting:</span>';
    html += '<label for="ao3-sort-depth-select" style="font-size:0.88em; color:#444; font-weight:600;">Depth:</label>';
    html += '<select id="ao3-sort-depth-select" class="ao3-companion-select" style="width:auto; margin-bottom:0; font-weight:600;">';
    html += '<option value="1">Current Page (20 Stories)</option>';
    html += '<option value="5" selected>5 Pages (100 Stories)</option>';
    html += '<option value="10">10 Pages (200 Stories)</option>';
    html += '<option value="15">15 Pages (300 Stories)</option>';
    html += '<option value="20">20 Pages (400 Stories)</option>';
    html += '<option value="25">25 Pages (500 Stories)</option>';
    html += '<option value="30">30 Pages (600 Stories)</option>';

    if (detectedMax > 1) {
      var labelStories = totalWorks ? (totalWorks + ' Stories') : (detectedMax * 20 + ' Stories');
      html += '<option value="' + detectedMax + '">Max Available (' + detectedMax + ' Pages / ' + labelStories + ')</option>';
    }
    html += '</select>';
    html += '<button id="ao3-btn-fetch-sort" class="ao3-companion-btn ao3-companion-btn-accent" style="width:auto; margin-bottom:0; white-space:nowrap;">🚀 Fetch & Sort Matches</button>';
    html += '</div>';

    // Embedded Sorted Pagination Box INSIDE AO3 Companion Box
    html += '<div id="ao3-companion-pagination-box" style="display:none; margin-top:12px; border-top:1px dashed #d0d0d0; padding-top:12px;"></div>';

    topWidget.innerHTML = html;
    worksList.parentNode.insertBefore(topWidget, worksList);

    // Attach Event Listeners
    var btnSaveNew = topWidget.querySelector('#ao3-btn-save-new');
    if (btnSaveNew) {
      btnSaveNew.addEventListener('click', function() {
        var input = topWidget.querySelector('#ao3-preset-name-input');
        var name = input ? input.value.trim() : '';
        if (!name) {
          alert('Please enter a name for the preset.');
          return;
        }
        if (typeof savePreset === 'function') {
          savePreset(name, window.location.href).then(function(newPreset) {
            if (typeof setActivePresetId === 'function') {
              return setActivePresetId(newPreset.id);
            }
          }).then(function() {
            loadPresetsState().then(function() {
              injectTopBarWidget();
              applyPrecisionScoring();
            });
          });
        }
      });
    }

    var btnOverwrite = topWidget.querySelector('#ao3-btn-overwrite-preset');
    if (btnOverwrite && activePresetId) {
      btnOverwrite.addEventListener('click', function() {
        if (confirm('Overwrite "' + activePresetObj.name + '" with current search URL parameters?')) {
          if (typeof overwritePreset === 'function') {
            overwritePreset(activePresetId, window.location.href).then(function() {
              loadPresetsState().then(function() {
                injectTopBarWidget();
                applyPrecisionScoring();
                alert('Preset successfully updated!');
              });
            });
          }
        }
      });
    }

    var btnClear = topWidget.querySelector('#ao3-btn-clear-active');
    if (btnClear) {
      btnClear.addEventListener('click', function() {
        if (typeof setActivePresetId === 'function') {
          setActivePresetId(null).then(function() {
            loadPresetsState().then(function() {
              injectTopBarWidget();
              applyPrecisionScoring();
            });
          });
        }
      });
    }

    var btnLoad = topWidget.querySelector('#ao3-btn-load-preset');
    if (btnLoad) {
      btnLoad.addEventListener('click', function() {
        var select = topWidget.querySelector('#ao3-preset-select');
        var selectedId = select ? select.value : null;
        if (!selectedId) {
          alert('Please select a preset to load.');
          return;
        }
        var targetPreset = currentPresets.find(function(p) { return p.id === selectedId; });
        if (targetPreset && targetPreset.url) {
          if (typeof setActivePresetId === 'function') {
            setActivePresetId(targetPreset.id).then(function() {
              window.location.href = targetPreset.url;
            });
          }
        }
      });
    }

    var btnFetchSort = topWidget.querySelector('#ao3-btn-fetch-sort');
    if (btnFetchSort) {
      btnFetchSort.addEventListener('click', function() {
        var selectDepth = topWidget.querySelector('#ao3-sort-depth-select');
        var targetDepth = selectDepth ? parseInt(selectDepth.value, 10) : detectedMax;

        if (targetDepth <= 1) {
          sortWorksByPrecision();
        } else {
          prefetchAndSortMultiPages(targetDepth);
        }
      });
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // Run initial setup safely
  var d = typeof document !== 'undefined' ? document : (typeof window !== 'undefined' ? window.document : null);
  if (d) {
    if (d.readyState === 'loading') {
      d.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

})();
