/**
 * AO3 Companion - Precision Scorer
 * 
 * Calculates precision score for AO3 fanfictions based strictly on Fandoms and Relationships.
 * Configurable Penalty Rules:
 * 1. Fandoms ("Includes other fandoms?"): Extra fandom tags deduct fandomPenaltyPct (default 2%).
 * 2. Romantic Relationships ("Includes other romantic relationships?"): Extra '/' pairing tags deduct romancePenaltyPct (default 5%).
 * 3. Friendship Relationships ("Includes other relationships?"): Extra '&' pairing tags deduct friendshipPenaltyPct (default 2%).
 */

(function(root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    // CommonJS / Node
    module.exports = factory();
  } else {
    // Browser global / Content script
    root.PrecisionScorer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {

  /**
   * Normalizes a tag string for comparison (lowercase, trimmed, space normalized)
   * @param {string} tag 
   * @returns {string}
   */
  function normalizeTag(tag) {
    if (!tag) return '';
    return tag.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /**
   * Extracts sorted lowercase participant names from a relationship tag (split by / or &)
   * e.g. "Character A/Character B" -> ["character a", "character b"]
   * e.g. "Character B & Character A" -> ["character a", "character b"]
   * @param {string} tag 
   * @returns {Array<string>}
   */
  function extractPairParticipants(tag) {
    if (!tag) return [];
    var parts = tag.split(/[/&]/).map(function(s) {
      return normalizeTag(s);
    }).filter(Boolean);
    return parts.sort();
  }

  function areSamePairParticipants(tag1, tag2) {
    var p1 = extractPairParticipants(tag1);
    var p2 = extractPairParticipants(tag2);
    if (p1.length !== p2.length || p1.length === 0) return false;
    for (var i = 0; i < p1.length; i++) {
      if (p1[i] !== p2[i]) return false;
    }
    return true;
  }

  function getPenaltyRate(key, config, defaultVal) {
    if (config && typeof config[key] === 'number' && !isNaN(config[key])) {
      return config[key] / 100;
    }
    return defaultVal;
  }

  /**
   * Calculates precision score for a single category (fandoms or relationships)
   * @param {Array<string>} presetTags - Tags requested in preset
   * @param {Array<string>} workTags - Tags found on the work
   * @param {string} category - Category name ('fandoms' or 'relationships')
   * @param {Object} penaltyConfig - Optional penalty configuration
   * @returns {Object} Score details { recall, precision, score, matchesCount, totalWorkTags }
   */
  function calculateCategoryPrecision(presetTags, workTags, category, penaltyConfig) {
    var normWork = (workTags || []).map(normalizeTag).filter(Boolean);

    if (!presetTags || presetTags.length === 0) {
      return null;
    }

    var normPreset = presetTags.map(normalizeTag).filter(Boolean);
    if (normPreset.length === 0) return null;

    var matchedPresetIndices = [];
    var matchedWorkIndices = [];

    normPreset.forEach(function(pt) {
      if (category === 'relationships') {
        normWork.forEach(function(wt, idx) {
          if (!matchedWorkIndices.includes(idx) && areSamePairParticipants(pt, wt)) {
            if (!matchedPresetIndices.includes(pt)) {
              matchedPresetIndices.push(pt);
            }
            matchedWorkIndices.push(idx);
          }
        });
      } else {
        var idx = normWork.indexOf(pt);
        if (idx >= 0) {
          matchedPresetIndices.push(pt);
          if (!matchedWorkIndices.includes(idx)) {
            matchedWorkIndices.push(idx);
          }
        }
      }
    });

    var matches = matchedPresetIndices.length;
    var recall = matches / normPreset.length;
    var precision = 0;
    var score = 0;

    var fandomRate = getPenaltyRate('fandomPenaltyPct', penaltyConfig, 0.02);
    var romanceRate = getPenaltyRate('romancePenaltyPct', penaltyConfig, 0.05);
    var friendshipRate = getPenaltyRate('friendshipPenaltyPct', penaltyConfig, 0.02);

    if (category === 'fandoms') {
      var extraFandoms = Math.max(0, normWork.length - normPreset.length);
      var fandomPenalty = extraFandoms * fandomRate;
      precision = Math.max(0, 1.0 - fandomPenalty);
      score = recall * precision;
    } else if (category === 'relationships') {
      var totalPenalty = 0;
      var presetParticipants = normPreset.map(extractPairParticipants);

      normWork.forEach(function(workTag, index) {
        if (!matchedWorkIndices.includes(index)) {
          var workParticipants = extractPairParticipants(workTag);
          var isSamePairAsPreset = presetParticipants.some(function(pArr) {
            if (pArr.length !== workParticipants.length || pArr.length === 0) return false;
            for (var i = 0; i < pArr.length; i++) {
              if (pArr[i] !== workParticipants[i]) return false;
            }
            return true;
          });

          if (!isSamePairAsPreset) {
            if (workTag.includes('/')) {
              totalPenalty += romanceRate;
            } else if (workTag.includes('&')) {
              totalPenalty += friendshipRate;
            } else {
              totalPenalty += romanceRate;
            }
          }
        }
      });

      precision = Math.max(0, 1.0 - totalPenalty);
      score = recall * precision;
    }

    return {
      recall: recall,
      precision: precision,
      score: score,
      matchesCount: matches,
      totalWorkTags: normWork.length,
      requestedCount: normPreset.length
    };
  }

  /**
   * Calculates overall work precision score against preset criteria (Fandoms & Relationships ONLY)
   * @param {Object} work - { fandoms: [], relationships: [] }
   * @param {Object} presetCriteria - { fandoms: [], relationships: [] }
   * @param {Object} penaltyConfig - { fandomPenaltyPct, romancePenaltyPct, friendshipPenaltyPct }
   * @returns {Object} { scorePercent: number, categoryScores: Object, totalEvaluated: number }
   */
  function calculatePrecisionScore(work, presetCriteria, penaltyConfig) {
    var weights = {
      fandoms: 1.0,
      relationships: 1.0
    };

    var totalWeight = 0;
    var weightedScoreSum = 0;
    var categoryScores = {};
    var totalEvaluated = 0;

    var workFandoms = (work && work.fandoms) || [];
    var presetFandoms = (presetCriteria && presetCriteria.fandoms) || [];

    var fandomRate = getPenaltyRate('fandomPenaltyPct', penaltyConfig, 0.02);
    var romanceRate = getPenaltyRate('romancePenaltyPct', penaltyConfig, 0.05);
    var friendshipRate = getPenaltyRate('friendshipPenaltyPct', penaltyConfig, 0.02);

    // Fandom Precision
    if (presetFandoms.length > 0) {
      var fandomResult = calculateCategoryPrecision(presetFandoms, workFandoms, 'fandoms', penaltyConfig);
      if (fandomResult) {
        categoryScores.fandoms = fandomResult;
        var wF = weights.fandoms;
        weightedScoreSum += fandomResult.score * wF;
        totalWeight += wF;
        totalEvaluated++;
      }
    } else if (workFandoms.length > 1) {
      var extraCount = workFandoms.length - 1;
      var multiFandomScore = Math.max(0, 1.0 - (extraCount * fandomRate));
      categoryScores.fandoms = {
        recall: 1.0,
        precision: multiFandomScore,
        score: multiFandomScore,
        matchesCount: 1,
        totalWorkTags: workFandoms.length,
        requestedCount: 0
      };
      var wF2 = weights.fandoms;
      weightedScoreSum += multiFandomScore * wF2;
      totalWeight += wF2;
      totalEvaluated++;
    }

    // Relationship Precision
    var presetRelationships = (presetCriteria && presetCriteria.relationships) || [];
    var workRelationships = (work && work.relationships) || [];

    if (presetRelationships.length > 0) {
      var relResult = calculateCategoryPrecision(presetRelationships, workRelationships, 'relationships', penaltyConfig);
      if (relResult !== null) {
        categoryScores.relationships = relResult;
        var wR = weights.relationships;
        weightedScoreSum += relResult.score * wR;
        totalWeight += wR;
        totalEvaluated++;
      }
    } else if (workRelationships.length > 1) {
      var relPenalty = 0;
      var firstPair = extractPairParticipants(workRelationships[0]);

      workRelationships.slice(1).forEach(function(rt) {
        var rtPair = extractPairParticipants(rt);
        var isSamePair = firstPair.length > 0 && firstPair.length === rtPair.length && firstPair.every(function(val, idx) { return val === rtPair[idx]; });
        if (!isSamePair) {
          if (rt.includes('/')) relPenalty += romanceRate;
          else if (rt.includes('&')) relPenalty += friendshipRate;
        }
      });
      var multiRelScore = Math.max(0, 1.0 - relPenalty);
      categoryScores.relationships = {
        recall: 1.0,
        precision: multiRelScore,
        score: multiRelScore,
        matchesCount: 1,
        totalWorkTags: workRelationships.length,
        requestedCount: 0
      };
      var wR2 = weights.relationships;
      weightedScoreSum += multiRelScore * wR2;
      totalWeight += wR2;
      totalEvaluated++;
    }

    if (totalEvaluated === 0 || totalWeight === 0) {
      return {
        scorePercent: 100,
        categoryScores: {},
        totalEvaluated: 0,
        label: '🎯 100% Exact Match'
      };
    }

    var finalScore = weightedScoreSum / totalWeight;
    var scorePercent = Math.round(finalScore * 100);
    if (finalScore < 1.0 && scorePercent >= 100) {
      scorePercent = 99;
    }

    var label = scorePercent + '% Match';
    if (scorePercent === 100) {
      label = '🎯 100% Exact Match';
    } else if (scorePercent >= 75) {
      label = '✨ ' + scorePercent + '% High Match';
    } else if (scorePercent >= 40) {
      label = '⚡ ' + scorePercent + '% Partial Match';
    } else {
      label = '⚠️ ' + scorePercent + '% Diluted Match';
    }

    return {
      scorePercent: scorePercent,
      rawScore: finalScore,
      categoryScores: categoryScores,
      totalEvaluated: totalEvaluated,
      label: label
    };
  }

  return {
    normalizeTag: normalizeTag,
    extractPairParticipants: extractPairParticipants,
    areSamePairParticipants: areSamePairParticipants,
    calculateCategoryPrecision: calculateCategoryPrecision,
    calculatePrecisionScore: calculatePrecisionScore
  };

});
