const assert = require('assert');
const Scorer = require('../lib/precision-scorer.js');

async function testScorerSuite() {
  console.log('\n--- 🧪 TEST SUITE 2: TAG PRECISION MATCH SCORER ---');

  // Test 2.1: Relationship Tag Classification (/ = 5% deduction, & = 2% deduction)
  const presetCriteria = {
    relationships: ['Clark Kent/Lois Lane'],
    fandoms: ['Superman (Movie 2025)']
  };

  const exactWork = {
    fandoms: ['Superman (Movie 2025)'],
    relationships: ['Clark Kent/Lois Lane']
  };

  const workWithExtraRomanceAndFriendship = {
    fandoms: ['Superman (Movie 2025)'],
    relationships: [
      'Clark Kent/Lois Lane',
      'Bruce Wayne/Diana Prince', // 1 extra romance (/) -> -5%
      'Clark Kent & Bruce Wayne', // 1 extra friendship (&) -> -2%
      'Lois Lane & Jimmy Olsen'   // 1 extra friendship (&) -> -2%
    ]
  };

  const scoreExact = Scorer.calculatePrecisionScore(exactWork, presetCriteria);
  const scoreMixed = Scorer.calculatePrecisionScore(workWithExtraRomanceAndFriendship, presetCriteria);

  assert.strictEqual(scoreExact.scorePercent, 100);
  assert.strictEqual(scoreExact.label, '🎯 100% Exact Match');

  // Penalty = 5% (romance) + 2% + 2% (friendships) = 9% -> Relationship score = 91%
  // Overall score: (100% fandom + 91% relationship) / 2 = 95.5% -> 96%
  assert.strictEqual(scoreMixed.categoryScores.relationships.precision, 0.91, 'Relationship precision must be 91% (5% romance penalty + 4% friendship penalty)');
  assert.strictEqual(scoreMixed.scorePercent, 96, 'Overall score must be 96%');
  console.log(`  ✓ 2.1 Relationship extra romance (5%) and friendship (2%) penalties accurately calculated (${scoreMixed.scorePercent}%)`);

  // Test 2.2: Unrelated / Missing Work
  const missingWork = {
    fandoms: ['Batman (Movies)'],
    relationships: ['Bruce Wayne/Diana Prince']
  };
  const scoreMissing = Scorer.calculatePrecisionScore(missingWork, presetCriteria);
  assert.strictEqual(scoreMissing.scorePercent, 0);
  assert.strictEqual(scoreMissing.label, '⚠️ 0% Diluted Match');
  console.log('  ✓ 2.2 Non-matching work scores 0%');

  // Test 2.3: Multi-Fandom Work Penalty (User scenario: >1 fandom dings the score by 2% per extra fandom tag)
  const multiFandomWork = {
    fandoms: ['Superman - All Media Types', 'Superman (Movie 2025)', 'Superman (Comics)'],
    relationships: ['Clark Kent/Lois Lane']
  };
  const scoreMultiFandom = Scorer.calculatePrecisionScore(multiFandomWork, presetCriteria);
  assert.strictEqual(scoreMultiFandom.categoryScores.fandoms.precision, 0.96, 'Fandom precision for 2 extra fandoms must be 1.0 - 0.04 = 0.96 (4% penalty)');
  assert.strictEqual(scoreMultiFandom.scorePercent, 98, 'Overall score for 100% relationship + 96% fandom must be 98%');
  console.log(`  ✓ 2.3 Work with 2 extra fandom tags is dinged by 4% to ${scoreMultiFandom.scorePercent}% (${scoreMultiFandom.label})`);

  // Test 2.4: Additional Tags Excluded (User directive: additional tags should not count)
  const workWithLotsOfAdditionalTags = {
    fandoms: ['Superman (Movie 2025)'],
    relationships: ['Clark Kent/Lois Lane'],
    freeformTags: ['Fluff', 'Angst', 'Alternate Universe', 'Slow Burn', 'Happy Ending', 'Coffee Shop AU', 'Domestic Bliss'],
    characters: ['Clark Kent', 'Lois Lane', 'Jimmy Olsen', 'Perry White', 'Lex Luthor']
  };
  const scoreAdditionalTags = Scorer.calculatePrecisionScore(workWithLotsOfAdditionalTags, presetCriteria);
  assert.strictEqual(scoreAdditionalTags.scorePercent, 100, 'Additional tags and character tags must NOT ding the match score');
  console.log('  ✓ 2.4 Additional freeform tags and character tags do NOT affect the score (stays 100%)');

  // Test 2.5: User Custom Config Penalties
  const customConfig = {
    fandomPenaltyPct: 5,        // 5% per extra fandom
    romancePenaltyPct: 10,      // 10% per extra romance
    friendshipPenaltyPct: 2     // 2% per extra friendship
  };

  const customScore = Scorer.calculatePrecisionScore(workWithExtraRomanceAndFriendship, presetCriteria, customConfig);
  // Custom penalty: 1 extra romance (10%) + 2 extra friendships (4%) = 14% -> Rel score = 86%
  // Overall score: (100% + 86%) / 2 = 93%
  assert.strictEqual(customScore.categoryScores.relationships.precision, 0.86);
  assert.strictEqual(customScore.scorePercent, 93);
  console.log(`  ✓ 2.5 User custom config penalties (5% fandom, 10% romance, 2% friendship) accurately applied (${customScore.scorePercent}%)`);

  // Test 2.6: Empty Criteria Handling
  const scoreEmpty = Scorer.calculatePrecisionScore(exactWork, null);
  assert.strictEqual(scoreEmpty.scorePercent, 100);
  console.log('  ✓ 2.6 Null preset criteria defaults cleanly to 100% base match for single-fandom work');

  // Test 2.7: User Reported Scenario (2 extra friendship tags deduct 4%) & Rounding Protection
  const userReportedWork = {
    fandoms: ['Superman (Movie 2025)'],
    relationships: [
      'Clark Kent/Lois Lane',
      'Justice Gang Members & Clark Kent', // extra friendship -> -2%
      'Joey Mason & Rex Mason'            // extra friendship -> -2%
    ]
  };
  const scoreUserWork = Scorer.calculatePrecisionScore(userReportedWork, presetCriteria);
  assert.strictEqual(scoreUserWork.categoryScores.relationships.precision, 0.96, '2 extra friendship tags must deduct 4% total (2% each)');
  assert.strictEqual(scoreUserWork.scorePercent, 98, 'Score with 2 extra friendship tags must be 98%, NOT 100%');
  assert.notStrictEqual(scoreUserWork.label, '🎯 100% Exact Match', 'Work with penalties must NOT be labeled 100% Exact Match');

  // Rounding protection check: a small penalty (e.g. 0.2% penalty -> finalScore = 0.998) must cap at 99%, NOT round to 100%
  const tinyPenaltyScore = Scorer.calculatePrecisionScore(userReportedWork, presetCriteria, { friendshipPenaltyPct: 0.1 });
  assert.strictEqual(tinyPenaltyScore.scorePercent, 99, 'Non-perfect match with tiny penalty must cap at 99%');
  console.log(`  ✓ 2.7 Work with 2 extra friendship tags accurately dings 4% (98%) and score capping protects 100% badge`);

  // Test 2.8: Same Character Pair Edge Case (Clark Kent & Lois Lane does NOT ding when Clark Kent/Lois Lane is requested)
  const workWithSamePairFriendship = {
    fandoms: ['Superman (Movie 2025)'],
    relationships: [
      'Clark Kent/Lois Lane',
      'Clark Kent & Lois Lane' // Same character pair as requested Clark Kent/Lois Lane -> 0 penalty!
    ]
  };
  const scoreSamePair = Scorer.calculatePrecisionScore(workWithSamePairFriendship, presetCriteria);
  assert.strictEqual(scoreSamePair.scorePercent, 100, 'Clark Kent & Lois Lane must NOT ding score when Clark Kent/Lois Lane is requested');
  assert.strictEqual(scoreSamePair.label, '🎯 100% Exact Match');

  const workWithSamePairAndUnrelatedFriendship = {
    fandoms: ['Superman (Movie 2025)'],
    relationships: [
      'Clark Kent/Lois Lane',
      'Clark Kent & Lois Lane',  // Same pair -> 0% penalty
      'Joey Mason & Rex Mason'   // Different pair -> 2% penalty
    ]
  };
  const scoreSamePairAndUnrelated = Scorer.calculatePrecisionScore(workWithSamePairAndUnrelatedFriendship, presetCriteria);
  assert.strictEqual(scoreSamePairAndUnrelated.categoryScores.relationships.precision, 0.98, 'Relationship precision must be 98% (1 unrelated friendship tag)');
  assert.strictEqual(scoreSamePairAndUnrelated.scorePercent, 99, 'Same pair friendship does not ding, 1 unrelated friendship tag dings 2% (relationship 98% -> overall 99%)');
  console.log('  ✓ 2.8 Same-character pair friendship tag (Clark Kent & Lois Lane) does NOT ding when Clark Kent/Lois Lane is requested');

  // Test 2.9: Reversed Character Name Order Matching (Lois Lane/Clark Kent matches Clark Kent/Lois Lane)
  const workWithReversedNames = {
    fandoms: ['Superman (Movie 2025)'],
    relationships: ['Lois Lane/Clark Kent'] // Reversed name order
  };
  const scoreReversed = Scorer.calculatePrecisionScore(workWithReversedNames, presetCriteria);
  assert.strictEqual(scoreReversed.scorePercent, 100, 'Reversed character name order (Lois Lane/Clark Kent) must match 100%');
  assert.strictEqual(scoreReversed.label, '🎯 100% Exact Match');

  const workWithReversedFriendship = {
    fandoms: ['Superman (Movie 2025)'],
    relationships: ['Lois Lane & Clark Kent'] // Reversed friendship tag
  };
  const scoreReversedFriendship = Scorer.calculatePrecisionScore(workWithReversedFriendship, presetCriteria);
  assert.strictEqual(scoreReversedFriendship.scorePercent, 100, 'Reversed friendship tag (Lois Lane & Clark Kent) must match 100%');
  console.log('  ✓ 2.9 Reversed character name order (Lois Lane/Clark Kent and Lois Lane & Clark Kent) matches 100%');
}

module.exports = testScorerSuite;
