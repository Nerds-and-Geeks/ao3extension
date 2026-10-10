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

  // Initialize extension on page load
  function init() {
    loadPresetsState().then(function() {
      injectSidebarWidget();
      injectTopSortBar();
      applyPrecisionScoring();
    });
  }

  function loadPresetsState() {
    if (typeof loadPresets === 'function') {
      return loadPresets().then(function(state) {
        currentPresets = state.presets || [];
        activePresetId = state.activePresetId || null;
        activePresetObj = currentPresets.find(function(p) { return p.id === activePresetId; }) || null;
      });
    }
    return Promise.resolve();
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
   * Calculates & displays precision badges for all works on the page
   */
  function applyPrecisionScoring(contextDoc) {
    var doc = contextDoc || document;
    var criteria = getActiveCriteria();

    var works = doc.querySelectorAll('ol.work.index > li.work, ul.work.index > li.work, ol.index.group > li.index.group, div.work');

    works.forEach(function(workEl) {
      var workTags = extractWorkDetailsFromDom(workEl);
      var scoreResult = { scorePercent: 100, label: '100%' };

      if (typeof PrecisionScorer !== 'undefined' && PrecisionScorer.calculatePrecisionScore) {
        scoreResult = PrecisionScorer.calculatePrecisionScore(workTags, criteria);
      }

      workEl.dataset.precisionScore = scoreResult.scorePercent;

      // Remove existing badge if present
      var oldBadge = workEl.querySelector('.ao3-precision-badge');
      if (oldBadge) oldBadge.remove();

      // Create new badge
      var heading = workEl.querySelector('h4.heading') || workEl.querySelector('header') || workEl.firstChild;
      if (heading) {
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

    // Hide native AO3 server pagination
    var nativePagination = document.querySelectorAll('ol.pagination, ul.pagination, div.pagination');
    nativePagination.forEach(function(el) {
      el.style.display = 'none';
    });

    // Inject custom extension pagination controls
    renderCustomPaginationBars(totalPages, pageNumber);
  }

  /**
   * Injects Custom Extension Pagination bars above and below sorted works
   */
  function renderCustomPaginationBars(totalPages, activePage) {
    var oldBars = document.querySelectorAll('.ao3-companion-custom-pagination');
    oldBars.forEach(function(el) { el.remove(); });

    if (totalPages <= 1) return;

    var container = document.querySelector('ol.work.index, ul.work.index, ol.index.group');
    if (!container) return;

    function buildNavElement() {
      var nav = document.createElement('div');
      nav.className = 'ao3-companion-custom-pagination';
      nav.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 6px; margin: 16px 0; font-family: Lucida Grande, sans-serif; font-size: 0.9em; flex-wrap: wrap; background: #fafafa; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px 12px;';

      var html = '<span style="font-weight: 700; margin-right: 8px; color: #900000;">Sorted Match Pages (' + sortedDataSet.length + ' Stories):</span>';

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

      nav.innerHTML = html;

      // Click event listener for pagination buttons
      nav.querySelectorAll('.ao3-pag-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var targetPage = parseInt(btn.dataset.page, 10);
          renderSortedPage(targetPage);
          var worksList = document.querySelector('ol.work.index, ul.work.index, ol.index.group');
          if (worksList) {
            worksList.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      });

      return nav;
    }

    // Top Pagination
    var topNav = buildNavElement();
    container.parentNode.insertBefore(topNav, container);

    // Bottom Pagination
    var bottomNav = buildNavElement();
    if (container.nextSibling) {
      container.parentNode.insertBefore(bottomNav, container.nextSibling);
    } else {
      container.parentNode.appendChild(bottomNav);
    }
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
   * Multi-Page Prefetching & Sorting (Up to 30 Pages / 600 Works):
   * Batches fetching of up to 30 pages of AO3 search results, scores all works,
   * and renders custom sorted pagination controls.
   */
  function prefetchAndSortMultiPages(maxPagesToFetch) {
    maxPagesToFetch = maxPagesToFetch || 30;

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

    var batchSize = 5;

    function processBatch(batchIndex) {
      var batch = urlsToFetch.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);
      if (batch.length === 0) {
        finishAndRender();
        return;
      }

      var lastPageInBatch = batch[batch.length - 1].pageNum;
      updateSortButtonsText('⏳ Prefetching page ' + lastPageInBatch + ' of ' + maxPagesToFetch + '...', '#ed6c02');

      var batchPromises = batch.map(function(item) {
        return fetch(item.url, { headers: { 'Accept': 'text/html' } })
          .then(function(res) {
            if (!res.ok) return '';
            return res.text();
          })
          .then(function(htmlText) {
            if (!htmlText) return;
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
          })
          .catch(function(err) {
            console.warn('Failed to prefetch page:', item.url, err);
          });
      });

      Promise.all(batchPromises).then(function() {
        processBatch(batchIndex + 1);
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

    processBatch(0);
  }

  function updateSortButtonsText(text, bg) {
    var sortBtns = document.querySelectorAll('#ao3-btn-sort-precision, #ao3-btn-top-sort, #ao3-btn-multipage-sort, #ao3-btn-multipage-30');
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
   * Injects quick-sort buttons right above the main works list
   */
  function injectTopSortBar() {
    var existingBar = document.getElementById('ao3-top-sort-bar');
    if (existingBar) existingBar.remove();

    var worksList = document.querySelector('ol.work.index, ul.work.index, ol.index.group');
    if (!worksList) return;

    var topBar = document.createElement('div');
    topBar.id = 'ao3-top-sort-bar';
    topBar.style.cssText = 'margin-bottom: 14px; display: flex; justify-content: flex-end; align-items: center; gap: 8px; background: #fafafa; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px 12px; flex-wrap: wrap;';

    topBar.innerHTML = '<span style="font-weight: 600; font-size: 0.9em; margin-right: auto; color: #444;">AO3 Companion:</span>' +
      '<button id="ao3-btn-top-sort" class="ao3-companion-btn ao3-companion-btn-accent" style="width: auto; min-height: 36px; padding: 6px 12px; margin-bottom: 0;">' +
      '🎯 Sort Page' +
      '</button>' +
      '<button id="ao3-btn-multipage-sort" class="ao3-companion-btn ao3-companion-btn-secondary" style="width: auto; min-height: 36px; padding: 6px 12px; margin-bottom: 0;">' +
      '⚡ Fetch 5 Pages' +
      '</button>' +
      '<button id="ao3-btn-multipage-30" class="ao3-companion-btn ao3-companion-btn-success" style="width: auto; min-height: 36px; padding: 6px 12px; margin-bottom: 0;">' +
      '🚀 Fetch Up to 30 Pages' +
      '</button>';

    worksList.parentNode.insertBefore(topBar, worksList);

    var topBtn = topBar.querySelector('#ao3-btn-top-sort');
    if (topBtn) topBtn.addEventListener('click', sortWorksByPrecision);

    var multiBtn5 = topBar.querySelector('#ao3-btn-multipage-sort');
    if (multiBtn5) multiBtn5.addEventListener('click', function() { prefetchAndSortMultiPages(5); });

    var multiBtn30 = topBar.querySelector('#ao3-btn-multipage-30');
    if (multiBtn30) multiBtn30.addEventListener('click', function() { prefetchAndSortMultiPages(30); });
  }

  /**
   * Injects Sidebar Control Widget into AO3 page
   */
  function injectSidebarWidget() {
    var existingWidget = document.getElementById('ao3-companion-widget-container');
    if (existingWidget) existingWidget.remove();

    var targetContainer = document.querySelector('#sidebar, #filters, form#work_search, .region[role="complementary"]');
    if (!targetContainer) {
      targetContainer = document.querySelector('#main');
    }
    if (!targetContainer) return;

    var widget = document.createElement('div');
    widget.id = 'ao3-companion-widget-container';
    widget.className = 'ao3-companion-widget';

    var html = '<h3>AO3 Companion</h3>';

    if (activePresetObj) {
      html += '<div class="ao3-companion-status active">';
      html += '<strong>Active Preset:</strong> ' + escapeHtml(activePresetObj.name);
      html += '</div>';
      html += '<button id="ao3-btn-overwrite-preset" class="ao3-companion-btn ao3-companion-btn-success">💾 Save Current Search on Top (Overwrite)</button>';
      html += '<button id="ao3-btn-clear-active" class="ao3-companion-btn ao3-companion-btn-secondary">❌ Clear Active Preset</button>';
    } else {
      html += '<div class="ao3-companion-status">';
      html += '<em>No active preset loaded.</em>';
      html += '</div>';
    }

    html += '<div class="ao3-companion-field" style="margin-top: 12px;">';
    html += '<label for="ao3-preset-name-input">Save Current Search as New Preset:</label>';
    html += '<input type="text" id="ao3-preset-name-input" class="ao3-companion-input" placeholder="e.g. Clark/Lois Canon Divergence" />';
    html += '<button id="ao3-btn-save-new" class="ao3-companion-btn">⭐ Save New Preset</button>';
    html += '</div>';

    if (currentPresets.length > 0) {
      html += '<div class="ao3-companion-field" style="margin-top: 12px;">';
      html += '<label for="ao3-preset-select">Saved Presets (' + currentPresets.length + '):</label>';
      html += '<select id="ao3-preset-select" class="ao3-companion-select">';
      html += '<option value="">-- Select a Preset --</option>';
      currentPresets.forEach(function(p) {
        var selected = (p.id === activePresetId) ? ' selected' : '';
        html += '<option value="' + escapeHtml(p.id) + '"' + selected + '>' + escapeHtml(p.name) + '</option>';
      });
      html += '</select>';
      html += '<button id="ao3-btn-load-preset" class="ao3-companion-btn ao3-companion-btn-secondary">🚀 Load Selected Preset</button>';
      html += '</div>';
    }

    html += '<div class="ao3-companion-field" style="margin-top: 14px; border-top: 1px dashed #d0d0d0; padding-top: 12px;">';
    html += '<label style="color: #6200ee; font-weight: 700;">🎯 Sorting Options:</label>';
    html += '<button id="ao3-btn-sort-precision" class="ao3-companion-btn ao3-companion-btn-accent">🎯 Sort Page by Match %</button>';
    html += '<button id="ao3-btn-sidebar-multipage" class="ao3-companion-btn ao3-companion-btn-success">🚀 Fetch & Sort Up to 30 Pages</button>';
    html += '</div>';

    widget.innerHTML = html;

    if (targetContainer.firstChild) {
      targetContainer.insertBefore(widget, targetContainer.firstChild);
    } else {
      targetContainer.appendChild(widget);
    }

    // Attach Event Listeners
    var btnSaveNew = widget.querySelector('#ao3-btn-save-new');
    if (btnSaveNew) {
      btnSaveNew.addEventListener('click', function() {
        var input = widget.querySelector('#ao3-preset-name-input');
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
              injectSidebarWidget();
              injectTopSortBar();
              applyPrecisionScoring();
            });
          });
        }
      });
    }

    var btnOverwrite = widget.querySelector('#ao3-btn-overwrite-preset');
    if (btnOverwrite && activePresetId) {
      btnOverwrite.addEventListener('click', function() {
        if (confirm('Overwrite "' + activePresetObj.name + '" with current search URL parameters?')) {
          if (typeof overwritePreset === 'function') {
            overwritePreset(activePresetId, window.location.href).then(function() {
              loadPresetsState().then(function() {
                injectSidebarWidget();
                injectTopSortBar();
                applyPrecisionScoring();
                alert('Preset successfully updated!');
              });
            });
          }
        }
      });
    }

    var btnClear = widget.querySelector('#ao3-btn-clear-active');
    if (btnClear) {
      btnClear.addEventListener('click', function() {
        if (typeof setActivePresetId === 'function') {
          setActivePresetId(null).then(function() {
            loadPresetsState().then(function() {
              injectSidebarWidget();
              injectTopSortBar();
              applyPrecisionScoring();
            });
          });
        }
      });
    }

    var btnLoad = widget.querySelector('#ao3-btn-load-preset');
    if (btnLoad) {
      btnLoad.addEventListener('click', function() {
        var select = widget.querySelector('#ao3-preset-select');
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

    var btnSort = widget.querySelector('#ao3-btn-sort-precision');
    if (btnSort) btnSort.addEventListener('click', sortWorksByPrecision);

    var btnMultiSide = widget.querySelector('#ao3-btn-sidebar-multipage');
    if (btnMultiSide) btnMultiSide.addEventListener('click', function() { prefetchAndSortMultiPages(30); });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // Run initial setup
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
