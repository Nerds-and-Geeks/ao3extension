/**
 * AO3 Companion - Popup UI Logic
 */

document.addEventListener('DOMContentLoaded', function() {
  var presetListEl = document.getElementById('preset-list');
  var inputNameEl = document.getElementById('new-preset-name');
  var btnSaveEl = document.getElementById('btn-save-current');

  function getActiveTabUrl() {
    return new Promise(function(resolve) {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
          if (tabs && tabs[0] && tabs[0].url) {
            resolve(tabs[0].url);
          } else {
            resolve(window.location.href);
          }
        });
      } else {
        resolve(window.location.href);
      }
    });
  }

  function renderPresets() {
    if (typeof loadPresets !== 'function') return;

    loadPresets().then(function(state) {
      var presets = state.presets || [];
      var activePresetId = state.activePresetId;

      presetListEl.innerHTML = '';

      if (presets.length === 0) {
        presetListEl.innerHTML = '<div class="empty-state">No saved presets yet.<br>Save your current search above!</div>';
        return;
      }

      presets.forEach(function(preset) {
        var item = document.createElement('div');
        item.className = 'preset-item' + (preset.id === activePresetId ? ' active' : '');

        var titleDiv = document.createElement('div');
        titleDiv.className = 'preset-title';
        titleDiv.textContent = preset.name;

        if (preset.id === activePresetId) {
          var badge = document.createElement('span');
          badge.className = 'preset-badge';
          badge.textContent = 'Active';
          titleDiv.appendChild(badge);
        }

        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'preset-actions';

        // Load Button
        var btnLoad = document.createElement('button');
        btnLoad.className = 'btn btn-secondary';
        btnLoad.textContent = '🚀 Load';
        btnLoad.addEventListener('click', function() {
          if (typeof setActivePresetId === 'function') {
            setActivePresetId(preset.id).then(function() {
              if (typeof chrome !== 'undefined' && chrome.tabs) {
                chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                  if (tabs[0]) {
                    chrome.tabs.update(tabs[0].id, { url: preset.url }, function() {
                      window.close();
                    });
                  }
                });
              }
            });
          }
        });

        // Overwrite Button
        var btnOverwrite = document.createElement('button');
        btnOverwrite.className = 'btn btn-primary';
        btnOverwrite.textContent = '💾 Overwrite';
        btnOverwrite.addEventListener('click', function() {
          getActiveTabUrl().then(function(currentUrl) {
            if (!currentUrl.includes('archiveofourown.org')) {
              alert('Please open an AO3 search or work list page first.');
              return;
            }
            if (confirm('Overwrite preset "' + preset.name + '" with current tab URL?')) {
              overwritePreset(preset.id, currentUrl).then(function() {
                renderPresets();
              });
            }
          });
        });

        // Delete Button
        var btnDelete = document.createElement('button');
        btnDelete.className = 'btn btn-danger';
        btnDelete.textContent = '🗑️ Delete';
        btnDelete.addEventListener('click', function() {
          if (confirm('Delete preset "' + preset.name + '"?')) {
            deletePreset(preset.id).then(function() {
              renderPresets();
            });
          }
        });

        actionsDiv.appendChild(btnLoad);
        actionsDiv.appendChild(btnOverwrite);
        actionsDiv.appendChild(btnDelete);

        item.appendChild(titleDiv);
        item.appendChild(actionsDiv);
        presetListEl.appendChild(item);
      });
    });
  }

  // Save current tab search as new preset
  btnSaveEl.addEventListener('click', function() {
    var name = inputNameEl.value.trim();
    if (!name) {
      alert('Please enter a preset name.');
      return;
    }

    getActiveTabUrl().then(function(currentUrl) {
      if (!currentUrl.includes('archiveofourown.org')) {
        alert('Active tab is not an AO3 page. Open an AO3 search page first!');
        return;
      }

      savePreset(name, currentUrl).then(function() {
        inputNameEl.value = '';
        renderPresets();
      });
    });
  });

  renderPresets();
});
