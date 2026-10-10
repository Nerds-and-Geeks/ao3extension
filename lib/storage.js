/**
 * AO3 Companion - Storage & Preset Manager
 */

var PRESETS_KEY = 'ao3_presets_v2';
var ACTIVE_PRESET_KEY = 'ao3_active_preset_id';
var PENALTY_CONFIG_KEY = 'ao3_penalty_config';

var DEFAULT_PENALTY_CONFIG = {
  fandomPenaltyPct: 2,       // 2% per extra fandom
  romancePenaltyPct: 5,      // 5% per extra romantic (/) relationship
  friendshipPenaltyPct: 2    // 2% per extra friendship (&) relationship
};

/**
 * Parses search parameters from an AO3 URL string
 * @param {string} urlStr 
 * @returns {Object} Extracted criteria categories
 */
function parseAo3SearchUrl(urlStr) {
  try {
    var urlObj = new URL(urlStr);
    var params = urlObj.searchParams;

    var fandoms = [];
    var relationships = [];
    var characters = [];
    var freeformTags = [];
    var excludeTags = [];

    // Extract Fandoms
    var fandomParam = params.get('work_search[fandom_names]');
    if (fandomParam) {
      fandoms = fandomParam.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    }

    // Extract Relationships
    var relParam = params.get('work_search[relationship_names]');
    if (relParam) {
      relationships = relParam.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    }

    // Extract Characters
    var charParam = params.get('work_search[character_names]');
    if (charParam) {
      characters = charParam.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    }

    // Extract Includes & Freeform Tags
    var incParam = params.get('work_search[include_work_tag_names]');
    if (incParam) {
      incParam.split(',').forEach(function(tag) {
        var t = tag.trim();
        if (t.includes('/')) {
          relationships.push(t);
        } else {
          freeformTags.push(t);
        }
      });
    }

    var freeParam = params.get('work_search[freeform_names]');
    if (freeParam) {
      freeformTags.push.apply(freeformTags, freeParam.split(',').map(function(s) { return s.trim(); }).filter(Boolean));
    }

    // Extract Excludes
    var excParam = params.get('work_search[exclude_work_tag_names]');
    if (excParam) {
      excludeTags = excParam.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    }

    // Extract Tag path if on /tags/TagName/works or tag_id parameter
    if (urlObj.pathname.includes('/tags/')) {
      var segments = urlObj.pathname.split('/');
      var tagIdx = segments.indexOf('tags');
      if (tagIdx >= 0 && segments[tagIdx + 1]) {
        var tagFromPath = decodeURIComponent(segments[tagIdx + 1]).replace(/\+/g, ' ');
        if (tagFromPath.includes('/') || tagFromPath.includes('*s*') || tagFromPath.includes(' & ')) {
          relationships.push(tagFromPath.replace(/\*s\*/g, '/'));
        } else {
          fandoms.push(tagFromPath);
          freeformTags.push(tagFromPath);
        }
      }
    }

    var tagIdParam = params.get('tag_id');
    if (tagIdParam) {
      var decodedTag = decodeURIComponent(tagIdParam).replace(/\+/g, ' ');
      if (decodedTag.includes('/') || decodedTag.includes('*s*') || decodedTag.includes(' & ')) {
        relationships.push(decodedTag.replace(/\*s\*/g, '/'));
      } else {
        fandoms.push(decodedTag);
        freeformTags.push(decodedTag);
      }
    }

    // Deduplicate
    fandoms = Array.from(new Set(fandoms));
    relationships = Array.from(new Set(relationships));
    characters = Array.from(new Set(characters));
    freeformTags = Array.from(new Set(freeformTags));
    excludeTags = Array.from(new Set(excludeTags));

    return {
      fandoms: fandoms,
      relationships: relationships,
      characters: characters,
      freeformTags: freeformTags,
      excludeTags: excludeTags,
      query: params.get('work_search[query]') || '',
      url: urlStr
    };
  } catch (err) {
    return {
      fandoms: [],
      relationships: [],
      characters: [],
      freeformTags: [],
      excludeTags: [],
      query: '',
      url: urlStr
    };
  }
}

/**
 * Loads all saved presets
 */
function loadPresets() {
  return new Promise(function(resolve) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([PRESETS_KEY, ACTIVE_PRESET_KEY], function(items) {
        resolve({
          presets: items[PRESETS_KEY] || [],
          activePresetId: items[ACTIVE_PRESET_KEY] || null
        });
      });
    } else {
      var data = typeof localStorage !== 'undefined' ? localStorage.getItem(PRESETS_KEY) : null;
      var active = typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_PRESET_KEY) : null;
      resolve({
        presets: data ? JSON.parse(data) : [],
        activePresetId: active
      });
    }
  });
}

/**
 * Loads user match penalty configuration
 */
function loadPenaltyConfig() {
  return new Promise(function(resolve) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([PENALTY_CONFIG_KEY], function(items) {
        resolve(Object.assign({}, DEFAULT_PENALTY_CONFIG, items[PENALTY_CONFIG_KEY] || {}));
      });
    } else {
      var data = typeof localStorage !== 'undefined' ? localStorage.getItem(PENALTY_CONFIG_KEY) : null;
      resolve(data ? Object.assign({}, DEFAULT_PENALTY_CONFIG, JSON.parse(data)) : DEFAULT_PENALTY_CONFIG);
    }
  });
}

/**
 * Saves user match penalty configuration
 */
function savePenaltyConfig(configObj) {
  return new Promise(function(resolve) {
    var merged = Object.assign({}, DEFAULT_PENALTY_CONFIG, configObj);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [PENALTY_CONFIG_KEY]: merged }, function() {
        resolve(merged);
      });
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PENALTY_CONFIG_KEY, JSON.stringify(merged));
      resolve(merged);
    } else {
      resolve(merged);
    }
  });
}

/**
 * Requirement 1: Save existing search as a preset with a name
 */
function savePreset(name, urlStr) {
  return loadPresets().then(function(state) {
    var presets = state.presets;
    var criteria = parseAo3SearchUrl(urlStr);

    var existingIdx = presets.findIndex(function(p) { return p.name.toLowerCase() === name.trim().toLowerCase(); });
    
    var presetObj = {
      id: existingIdx >= 0 ? presets[existingIdx].id : ('preset_' + Date.now()),
      name: name.trim(),
      url: urlStr,
      criteria: criteria,
      lastUpdated: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      presets[existingIdx] = presetObj;
    } else {
      presets.push(presetObj);
    }

    return savePresetsState(presets, presetObj.id).then(function() {
      return presetObj;
    });
  });
}

/**
 * Requirement 2: Edit a loaded preset by saving the current search on top
 */
function overwritePreset(presetId, newUrlStr) {
  return loadPresets().then(function(state) {
    var presets = state.presets;
    var idx = presets.findIndex(function(p) { return p.id === presetId; });

    if (idx < 0) {
      throw new Error('Preset not found to overwrite');
    }

    var criteria = parseAo3SearchUrl(newUrlStr);
    presets[idx].url = newUrlStr;
    presets[idx].criteria = criteria;
    presets[idx].lastUpdated = new Date().toISOString();

    return savePresetsState(presets, presetId).then(function() {
      return presets[idx];
    });
  });
}

/**
 * Deletes a preset by ID
 */
function deletePreset(presetId) {
  return loadPresets().then(function(state) {
    var presets = state.presets.filter(function(p) { return p.id !== presetId; });
    var newActive = state.activePresetId === presetId ? null : state.activePresetId;
    return savePresetsState(presets, newActive);
  });
}

/**
 * Sets active loaded preset ID
 */
function setActivePresetId(presetId) {
  return new Promise(function(resolve) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [ACTIVE_PRESET_KEY]: presetId }, resolve);
    } else if (typeof localStorage !== 'undefined') {
      if (presetId) {
        localStorage.setItem(ACTIVE_PRESET_KEY, presetId);
      } else {
        localStorage.removeItem(ACTIVE_PRESET_KEY);
      }
      resolve();
    } else {
      resolve();
    }
  });
}

function savePresetsState(presets, activePresetId) {
  return new Promise(function(resolve) {
    var payload = {};
    payload[PRESETS_KEY] = presets;
    if (activePresetId !== undefined) {
      payload[ACTIVE_PRESET_KEY] = activePresetId;
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(payload, resolve);
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
      if (activePresetId) {
        localStorage.setItem(ACTIVE_PRESET_KEY, activePresetId);
      } else {
        localStorage.removeItem(ACTIVE_PRESET_KEY);
      }
      resolve();
    } else {
      resolve();
    }
  });
}

/**
 * Determines whether a given AO3 URL is an active search, tag, or filter listing page.
 * Excludes non-search pages such as user profiles, user pseud pages, and single work reader views.
 * @param {string} urlStr 
 * @returns {boolean}
 */
function isSearchOrFilterPage(urlStr) {
  try {
    if (!urlStr) return false;
    var urlObj = new URL(urlStr);
    var path = urlObj.pathname;

    // Exclude user profile/pseud pages (e.g. /users/Username, /users/Username/pseuds/...)
    if (path.includes('/users/')) {
      if (path.match(/\/users\/[^\/]+(?:\/pseuds\/[^\/]+)?\/?$/)) {
        return false;
      }
      if (!path.endsWith('/works') && !path.endsWith('/bookmarks')) {
        return false;
      }
    }

    // Exclude single work reader pages (e.g. /works/12345678 or /works/12345678/chapters/999)
    if (path.match(/\/works\/\d+/)) {
      return false;
    }

    // Search and filter listing pages:
    if (path === '/works' || path === '/works/' || path === '/works/search') return true;
    if (path.indexOf('/tags/') === 0) return true;
    if (path.indexOf('/collections/') === 0 || path.indexOf('/fandoms/') === 0 || path.indexOf('/media/') === 0) return true;

    // Check query parameters for active search/filter queries
    var params = urlObj.searchParams;
    if (params.has('work_search[fandom_names]') || params.has('work_search[query]') || params.has('work_search[relationship_names]') || params.has('tag_id') || params.has('commit')) {
      return true;
    }

    return false;
  } catch (err) {
    return false;
  }
}

var BLOCKED_AUTHORS_KEY = 'ao3_blocked_authors';

/**
 * Loads the list of blocked authors
 * @returns {Promise<Array<string>>}
 */
function loadBlockedAuthors() {
  return new Promise(function(resolve) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([BLOCKED_AUTHORS_KEY], function(items) {
        resolve(items[BLOCKED_AUTHORS_KEY] || []);
      });
    } else {
      var data = null;
      if (typeof window !== 'undefined' && window.localStorage) {
        data = window.localStorage.getItem(BLOCKED_AUTHORS_KEY);
      } else if (typeof localStorage !== 'undefined') {
        data = localStorage.getItem(BLOCKED_AUTHORS_KEY);
      }
      resolve(data ? JSON.parse(data) : []);
    }
  });
}

/**
 * Adds an author to the blocked authors list
 * @param {string} authorName 
 * @returns {Promise<Array<string>>} Updated blocked authors list
 */
function addBlockedAuthor(authorName) {
  if (!authorName || !authorName.trim()) return loadBlockedAuthors();
  var cleanName = authorName.trim();

  return loadBlockedAuthors().then(function(list) {
    var exists = list.some(function(name) { return name.toLowerCase() === cleanName.toLowerCase(); });
    if (!exists) {
      list.push(cleanName);
    }
    return saveBlockedAuthors(list).then(function() { return list; });
  });
}

/**
 * Removes an author from the blocked authors list
 * @param {string} authorName 
 * @returns {Promise<Array<string>>} Updated blocked authors list
 */
function removeBlockedAuthor(authorName) {
  if (!authorName) return loadBlockedAuthors();
  var cleanName = authorName.trim().toLowerCase();

  return loadBlockedAuthors().then(function(list) {
    var newList = list.filter(function(name) { return name.toLowerCase() !== cleanName; });
    return saveBlockedAuthors(newList).then(function() { return newList; });
  });
}

function saveBlockedAuthors(authorList) {
  return new Promise(function(resolve) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [BLOCKED_AUTHORS_KEY]: authorList }, resolve);
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(BLOCKED_AUTHORS_KEY, JSON.stringify(authorList));
      resolve();
    } else {
      resolve();
    }
  });
}

// UMD / Global Export Definition
var root = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
if (root) {
  root.parseAo3SearchUrl = parseAo3SearchUrl;
  root.isSearchOrFilterPage = isSearchOrFilterPage;
  root.loadPresets = loadPresets;
  root.savePreset = savePreset;
  root.overwritePreset = overwritePreset;
  root.deletePreset = deletePreset;
  root.setActivePresetId = setActivePresetId;
  root.loadPenaltyConfig = loadPenaltyConfig;
  root.savePenaltyConfig = savePenaltyConfig;
  root.loadBlockedAuthors = loadBlockedAuthors;
  root.addBlockedAuthor = addBlockedAuthor;
  root.removeBlockedAuthor = removeBlockedAuthor;
  root.DEFAULT_PENALTY_CONFIG = DEFAULT_PENALTY_CONFIG;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseAo3SearchUrl: parseAo3SearchUrl,
    isSearchOrFilterPage: isSearchOrFilterPage,
    loadPresets: loadPresets,
    savePreset: savePreset,
    overwritePreset: overwritePreset,
    deletePreset: deletePreset,
    setActivePresetId: setActivePresetId,
    loadPenaltyConfig: loadPenaltyConfig,
    savePenaltyConfig: savePenaltyConfig,
    loadBlockedAuthors: loadBlockedAuthors,
    addBlockedAuthor: addBlockedAuthor,
    removeBlockedAuthor: removeBlockedAuthor,
    DEFAULT_PENALTY_CONFIG: DEFAULT_PENALTY_CONFIG
  };
}


