/**
 * AO3 Companion - Popup UI Logic
 */

document.addEventListener('DOMContentLoaded', function() {
  var presetListEl = document.getElementById('preset-list');
  var inputNameEl = document.getElementById('new-preset-name');
  var btnSaveEl = document.getElementById('btn-save-current');

  // Config Sliders & Badges
  var sliderFandom = document.getElementById('cfg-fandom-slider');
  var valFandom = document.getElementById('cfg-fandom-val');
  var sliderRomance = document.getElementById('cfg-romance-slider');
  var valRomance = document.getElementById('cfg-romance-val');
  var sliderFriendship = document.getElementById('cfg-friendship-slider');
  var valFriendship = document.getElementById('cfg-friendship-val');
  var btnSaveConfig = document.getElementById('btn-save-config');

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

  function initConfigPanel() {
    if (typeof loadPenaltyConfig !== 'function') return;

    loadPenaltyConfig().then(function(cfg) {
      if (sliderFandom) {
        sliderFandom.value = cfg.fandomPenaltyPct;
        valFandom.textContent = cfg.fandomPenaltyPct + '%';
        sliderFandom.addEventListener('input', function() {
          valFandom.textContent = sliderFandom.value + '%';
        });
      }

      if (sliderRomance) {
        sliderRomance.value = cfg.romancePenaltyPct;
        valRomance.textContent = cfg.romancePenaltyPct + '%';
        sliderRomance.addEventListener('input', function() {
          valRomance.textContent = sliderRomance.value + '%';
        });
      }

      if (sliderFriendship) {
        sliderFriendship.value = cfg.friendshipPenaltyPct;
        valFriendship.textContent = cfg.friendshipPenaltyPct + '%';
        sliderFriendship.addEventListener('input', function() {
          valFriendship.textContent = sliderFriendship.value + '%';
        });
      }
    });

    if (btnSaveConfig) {
      btnSaveConfig.addEventListener('click', function() {
        var newConfig = {
          fandomPenaltyPct: parseFloat(sliderFandom.value),
          romancePenaltyPct: parseFloat(sliderRomance.value),
          friendshipPenaltyPct: parseFloat(sliderFriendship.value)
        };

        if (typeof savePenaltyConfig === 'function') {
          savePenaltyConfig(newConfig).then(function() {
            var origText = btnSaveConfig.textContent;
            btnSaveConfig.textContent = '✓ Config Saved!';
            btnSaveConfig.style.backgroundColor = '#2e7d32';
            btnSaveConfig.style.color = '#ffffff';
            setTimeout(function() {
              btnSaveConfig.textContent = origText;
              btnSaveConfig.style.backgroundColor = '';
              btnSaveConfig.style.color = '';
            }, 2000);
          });
        }
      });
    }
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
  initConfigPanel();
});
