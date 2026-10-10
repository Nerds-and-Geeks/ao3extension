/**
 * AO3 Companion - Precision Scorer
 * 
 * Calculates precision score for AO3 fanfictions based strictly on Fandoms and Relationships.
 * Rules:
 * 1. Fandoms: Extra fandom tags deduct 2% per extra tag.
 * 2. Relationships: 
 *    - '/' is romance: each extra romantic pairing tag deducts 5%.
 *    - '&' is friendship: each extra friendship pairing tag deducts 0.5%.
 * 3. Additional tags & character tags are excluded per user directive.
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
   * Calculates precision score for a single category (fandoms or relationships)
   * @param {Array<string>} presetTags - Tags requested in preset
   * @param {Array<string>} workTags - Tags found on the work
   * @param {string} category - Category name ('fandoms' or 'relationships')
   * @returns {Object} Score details { recall, precision, score, matchesCount, totalWorkTags }
   */
  function calculateCategoryPrecision(presetTags, workTags, category) {
    var normWork = (workTags || []).map(normalizeTag).filter(Boolean);

    if (!presetTags || presetTags.length === 0) {
      return null;
    }

    var normPreset = presetTags.map(normalizeTag).filter(Boolean);
    if (normPreset.length === 0) return null;

    var matchedPresetIndices = [];
    var matchedWorkIndices = [];

    normPreset.forEach(function(pt) {
      var idx = normWork.indexOf(pt);
      if (idx >= 0) {
        matchedPresetIndices.push(pt);
        if (!matchedWorkIndices.includes(idx)) {
          matchedWorkIndices.push(idx);
        }
      }
    });

    var matches = matchedPresetIndices.length;
    var recall = matches / normPreset.length;
    var precision = 0;
    var score = 0;

    if (category === 'fandoms') {
      // Each extra fandom tag dings 2% (0.02)
      var extraFandoms = Math.max(0, normWork.length - normPreset.length);
      var fandomPenalty = extraFandoms * 0.02;
      precision = Math.max(0, 1.0 - fandomPenalty);
      score = recall * precision;
    } else if (category === 'relationships') {
      // Extra relationship tag deductions:
      // '/' (romance) deducts 5% (0.05) per extra tag
      // '&' (friendship) deducts 0.5% (0.005) per extra tag
      var totalPenalty = 0;

      normWork.forEach(function(workTag, index) {
        if (!matchedWorkIndices.includes(index)) {
          if (workTag.includes('/')) {
            totalPenalty += 0.05; // 5% deduction for extra romance tag
          } else if (workTag.includes('&')) {
            totalPenalty += 0.005; // 0.5% deduction for extra friendship tag
          } else {
            totalPenalty += 0.05; // default fallback if unclassified
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
   * @returns {Object} { scorePercent: number, categoryScores: Object, totalEvaluated: number }
   */
  function calculatePrecisionScore(work, presetCriteria) {
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

    // Fandom Precision
    if (presetFandoms.length > 0) {
      var fandomResult = calculateCategoryPrecision(presetFandoms, workFandoms, 'fandoms');
      if (fandomResult) {
        categoryScores.fandoms = fandomResult;
        var wF = weights.fandoms;
        weightedScoreSum += fandomResult.score * wF;
        totalWeight += wF;
        totalEvaluated++;
      }
    } else if (workFandoms.length > 1) {
      var extraCount = workFandoms.length - 1;
      var multiFandomScore = Math.max(0, 1.0 - (extraCount * 0.02));
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
      var relResult = calculateCategoryPrecision(presetRelationships, workRelationships, 'relationships');
      if (relResult !== null) {
        categoryScores.relationships = relResult;
        var wR = weights.relationships;
        weightedScoreSum += relResult.score * wR;
        totalWeight += wR;
        totalEvaluated++;
      }
    } else if (workRelationships.length > 1) {
      // If no relationship specified in preset, but work has > 1 relationship tag:
      // deduct 5% for extra romance tags beyond 1st, and 0.5% for extra friendship tags
      var relPenalty = 0;
      workRelationships.slice(1).forEach(function(rt) {
        if (rt.includes('/')) relPenalty += 0.05;
        else if (rt.includes('&')) relPenalty += 0.005;
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
    calculateCategoryPrecision: calculateCategoryPrecision,
    calculatePrecisionScore: calculatePrecisionScore
  };

});
