#!/usr/bin/env node

/**
 * Test Coverage Reporting and Validation Script
 * 
 * This script generates comprehensive test coverage reports for the DJ and AI integration
 * testing sprint, ensuring we meet the 90% coverage requirement and performance benchmarks.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const COVERAGE_THRESHOLD = 90; // 90% coverage requirement
const PERFORMANCE_BENCHMARKS = {
  audioProcessing: 10, // < 10ms latency
  uiResponse: 100, // < 100ms response time
  apiResponse: 2000 // < 2s API response time
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  dim: '\x1b[2m'
};

function colorLog(message, color = colors.white) {
  console.log(`${color}${message}${colors.reset}`);
}

function colorError(message) {
  console.error(`${colors.red}${message}${colors.reset}`);
}

function colorSuccess(message) {
  console.log(`${colors.green}${message}${colors.reset}`);
}

function colorWarning(message) {
  console.warn(`${colors.yellow}${message}${colors.reset}`);
}

function colorInfo(message) {
  console.info(`${colors.blue}${message}${colors.reset}`);
}

function colorDim(message) {
  console.log(`${colors.dim}${message}${colors.reset}`);
}

// Parse coverage from different test runners
function parseCoverage(coverageData, source) {
  try {
    if (typeof coverageData === 'string') {
      // JSON format
      const coverage = JSON.parse(coverageData);
      return {
        lines: coverage.lines?.pct || 0,
        functions: coverage.functions?.pct || 0,
        branches: coverage.branches?.pct || 0,
        statements: coverage.statements?.pct || 0
      };
    } else if (typeof coverageData === 'object') {
      // Istanbul format
      return {
        lines: coverageData.lines?.pct || 0,
        functions: coverageData.functions?.pct || 0,
        branches: coverageData.branches?.pct || 0,
        statements: coverageData.statements?.pct || 0
      };
    }
    return { lines: 0, functions: 0, branches: 0, statements: 0 };
  } catch (error) {
    colorError(`Error parsing coverage from ${source}: ${error.message}`);
    return { lines: 0, functions: 0, branches: 0, statements: 0 };
  }
}

// Check if coverage meets threshold
function meetsThreshold(coverage) {
  return (
    coverage.lines >= COVERAGE_THRESHOLD &&
    coverage.functions >= COVERAGE_THRESHOLD &&
    coverage.branches >= COVERAGE_THRESHOLD &&
    coverage.statements >= COVERAGE_THRESHOLD
  );
}

// Generate coverage report
function generateCoverageReport(unitCoverage, integrationCoverage) {
  colorLog('\n📊 Test Coverage Report');
  colorLog('='.repeat(50));
  
  // Unit Tests Coverage
  if (unitCoverage) {
    const unit = parseCoverage(unitCoverage, 'unit tests');
    colorLog(`\n${colors.cyan}Unit Tests Coverage:`);
    colorLog(`  Lines: ${unit.lines.toFixed(2)}% ${meetsThreshold(unit) ? '✅' : '❌'}`);
    colorLog(`  Functions: ${unit.functions.toFixed(2)}% ${meetsThreshold(unit) ? '✅' : '❌'}`);
    colorLog(`  Branches: ${unit.branches.toFixed(2)}% ${meetsThreshold(unit) ? '✅' : '❌'}`);
    colorLog(`  Statements: ${unit.statements.toFixed(2)}% ${meetsThreshold(unit) ? '✅' : '❌'}`);
  }
  
  // Integration Tests Coverage
  if (integrationCoverage) {
    const integration = parseCoverage(integrationCoverage, 'integration tests');
    colorLog(`\n${colors.magenta}Integration Tests Coverage:`);
    colorLog(`  Lines: ${integration.lines.toFixed(2)}% ${meetsThreshold(integration) ? '✅' : '❌'}`);
    colorLog(`  Functions: ${integration.functions.toFixed(2)}% ${meetsThreshold(integration) ? '✅' : '❌'}`);
    colorLog(`  Branches: ${integration.branches.toFixed(2)}% ${meetsThreshold(integration) ? '✅' : '❌'}`);
    colorLog(`  Statements: ${integration.statements.toFixed(2)}% ${meetsThreshold(integration) ? '✅' : '❌'}`);
  }
  
  // Overall Assessment
  let overallPassed = true;
  if (unitCoverage && !meetsThreshold(unit)) {
    overallPassed = false;
  }
  if (integrationCoverage && !meetsThreshold(integration)) {
    overallPassed = false;
  }
  
  colorLog(`\n${colors.bright}Overall Assessment:`);
  if (overallPassed) {
    colorSuccess(`✅ All coverage requirements met (${COVERAGE_THRESHOLD}% threshold)`);
  } else {
    colorError(`❌ Coverage requirements not met (${COVERAGE_THRESHOLD}% threshold required)`);
  }
  
  return {
    unit: unitCoverage ? parseCoverage(unitCoverage, 'unit tests') : null,
    integration: integrationCoverage ? parseCoverage(integrationCoverage, 'integration tests') : null,
    overallPassed
  };
}

// Run tests and collect coverage
function runTests() {
  colorLog('🧪 Running test suite...');
  
  const testResults = {
    unit: null,
    integration: null,
    performance: {},
    passed: false
  };
  
  try {
    // Run unit tests
    colorLog('\n🔬 Running unit tests...');
    const unitResult = execSync('npm run test:unit --coverage --reporter=json', { 
      encoding: 'utf8',
      stdio: ['pipe', 'inherit']
    });
    
    if (unitResult.status !== 0) {
      colorError(`Unit tests failed with exit code: ${unitResult.status}`);
      return testResults;
    }
    
    const unitCoverage = JSON.parse(unitResult.stdout);
    testResults.unit = unitCoverage;
    
    // Run integration tests
    colorLog('\n🔗 Running integration tests...');
    const integrationResult = execSync('npm run test:integration --coverage --reporter=json', { 
      encoding: 'utf8',
      stdio: ['pipe', 'inherit']
    });
    
    if (integrationResult.status !== 0) {
      colorError(`Integration tests failed with exit code: ${integrationResult.status}`);
      return testResults;
    }
    
    const integrationCoverage = JSON.parse(integrationResult.stdout);
    testResults.integration = integrationCoverage;
    
    // Run performance benchmarks
    colorLog('\n⚡ Running performance benchmarks...');
    const perfResult = execSync('npm run test:performance --reporter=json', { 
      encoding: 'utf8',
      stdio: ['pipe', 'inherit']
    });
    
    if (perfResult.status !== 0) {
      colorError(`Performance tests failed with exit code: ${perfResult.status}`);
      return testResults;
    }
    
    testResults.performance = JSON.parse(perfResult.stdout);
    testResults.passed = true;
    
  } catch (error) {
    colorError(`Error running tests: ${error.message}`);
    return testResults;
  }
  
  return testResults;
}

// Validate performance benchmarks
function validatePerformance(performanceData) {
  colorLog('\n⚡ Performance Validation:');
  
  let allPassed = true;
  
  // Check DJ mixer latency
  if (performanceData.djMixer) {
    const djLatency = performanceData.djMixer.latency || 0;
    const passed = djLatency < PERFORMANCE_BENCHMARKS.audioProcessing;
    colorLog(`  DJ Mixer Latency: ${djLatency}ms ${passed ? '✅' : '❌'} (target: <${PERFORMANCE_BENCHMARKS.audioProcessing}ms)`);
    if (!passed) allPassed = false;
  }
  
  // Check UI response time
  if (performanceData.uiResponse) {
    const uiResponseTime = performanceData.uiResponse.average || 0;
    const passed = uiResponseTime < PERFORMANCE_BENCHMARKS.uiResponse;
    colorLog(`  UI Response Time: ${uiResponseTime}ms ${passed ? '✅' : '❌'} (target: <${PERFORMANCE_BENCHMARKS.uiResponse}ms)`);
    if (!passed) allPassed = false;
  }
  
  // Check API response time
  if (performanceData.apiResponse) {
    const apiResponseTime = performanceData.apiResponse.average || 0;
    const passed = apiResponseTime < PERFORMANCE_BENCHMARKS.apiResponse;
    colorLog(`  API Response Time: ${apiResponseTime}ms ${passed ? '✅' : '❌'} (target: <${PERFORMANCE_BENCHMARKS.apiResponse}ms)`);
    if (!passed) allPassed = false;
  }
  
  return allPassed;
}

// Generate final report
function generateFinalReport(testResults) {
  colorLog('\n📋 Final Test Report');
  colorLog('='.repeat(50));
  
  const report = generateCoverageReport(testResults.unit, testResults.integration);
  
  // Add performance validation
  if (testResults.performance) {
    const performancePassed = validatePerformance(testResults.performance);
    report.overallPassed = report.overallPassed && performancePassed;
  }
  
  // Save report to file
  const reportData = {
    timestamp: new Date().toISOString(),
    coverage: {
      unit: report.unit,
      integration: report.integration,
      threshold: COVERAGE_THRESHOLD,
      met: report.overallPassed
    },
    performance: {
      benchmarks: PERFORMANCE_BENCHMARKS,
      results: testResults.performance,
      passed: report.overallPassed
    },
    summary: {
      totalTests: (testResults.unit?.totalTests || 0) + (testResults.integration?.totalTests || 0),
      passedTests: report.overallPassed ? 'All tests passed' : 'Some tests failed',
      readyForProduction: report.overallPassed
    }
  };
  
  try {
    fs.writeFileSync('test-coverage-report.json', JSON.stringify(reportData, null, 2));
    colorSuccess('✅ Report saved to test-coverage-report.json');
    
    // Generate console summary
    colorLog('\n📊 Summary:');
    colorLog(`  Total Tests: ${reportData.summary.totalTests}`);
    colorLog(`  Status: ${reportData.summary.passedTests}`);
    colorLog(`  Production Ready: ${reportData.summary.readyForProduction ? '✅' : '❌'}`);
    
    if (reportData.summary.readyForProduction) {
      colorSuccess('\n🎉 All P0 tests completed! Ready for production deployment.');
    } else {
      colorError('\n❌ Some tests failed. Review and fix before deployment.');
    }
    
  } catch (error) {
    colorError(`Error saving report: ${error.message}`);
  }
  
  return reportData;
}

// Main execution
function main() {
  colorLog('🚀 Starting DJ & AI Integration Test Coverage Validation');
  colorLog('Target: 90% coverage and performance benchmarks');
  
  const testResults = runTests();
  generateFinalReport(testResults);
  
  // Exit with appropriate code
  process.exit(testResults.passed ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  runTests,
  generateCoverageReport,
  validatePerformance,
  generateFinalReport
};