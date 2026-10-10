const assert = require('assert');
const Scorer = require('../lib/precision-scorer.js');

async function testScorerSuite() {
  console.log('\n--- 🧪 TEST SUITE 2: TAG PRECISION MATCH SCORER ---');

  // Test 2.1: Relationship Tag Classification (/ = 5% deduction, & = 0.5% deduction)
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
      'Clark Kent & Bruce Wayne', // 1 extra friendship (&) -> -0.5%
      'Lois Lane & Jimmy Olsen'   // 1 extra friendship (&) -> -0.5%
    ]
  };

  const scoreExact = Scorer.calculatePrecisionScore(exactWork, presetCriteria);
  const scoreMixed = Scorer.calculatePrecisionScore(workWithExtraRomanceAndFriendship, presetCriteria);

  assert.strictEqual(scoreExact.scorePercent, 100);
  assert.strictEqual(scoreExact.label, '🎯 100% Exact Match');

  // Penalty = 5% (romance) + 0.5% + 0.5% (friendships) = 6% -> Relationship score = 94%
  // Overall score: (100% fandom + 94% relationship) / 2 = 97%
  assert.strictEqual(scoreMixed.categoryScores.relationships.precision, 0.94, 'Relationship precision must be 94% (5% romance penalty + 1% friendship penalty)');
  assert.strictEqual(scoreMixed.scorePercent, 97, 'Overall score must be 97%');
  console.log(`  ✓ 2.1 Relationship extra romance (5%) and friendship (0.5%) penalties accurately calculated (${scoreMixed.scorePercent}%)`);

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
}

module.exports = testScorerSuite;
