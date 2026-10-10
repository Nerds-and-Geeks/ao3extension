/**
 * AO3 Companion Extension - Automated Test Suite Runner
 */

const testStorageSuite = require('./test_storage.test.js');
const testScorerSuite = require('./test_precision_scorer.test.js');
const testDomSuite = require('./test_content_dom.test.js');

async function runAllTests() {
  console.log('====================================================');
  console.log('🚀 AO3 COMPANION EXTENSION AUTOMATED TEST RUNNER');
  console.log('====================================================');

  const startTime = Date.now();

  try {
    await testStorageSuite();
    await testScorerSuite();
    await testDomSuite();

    const elapsed = Date.now() - startTime;
    console.log('\n====================================================');
    console.log(`🎉 ALL TEST SUITES PASSED VERIFIED IN ${elapsed}ms!`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n====================================================');
    console.error('❌ TEST SUITE FAILED WITH ERROR:');
    console.error(err);
    console.error('====================================================\n');
    process.exit(1);
  }
}

runAllTests();
