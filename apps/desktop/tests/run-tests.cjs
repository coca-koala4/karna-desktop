'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
}

function color(colorName, text) {
  return COLORS[colorName] + text + COLORS.reset
}

const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  suites: 0,
  startTime: 0,
  failures: []
}

let currentSuite = null

function describe(name, fn) {
  stats.suites++
  const suite = {
    name,
    tests: [],
    beforeAllFns: [],
    afterAllFns: [],
    beforeEachFns: [],
    afterEachFns: []
  }
  const prevSuite = currentSuite
  currentSuite = suite

  try {
    fn()
  } finally {
    runSuite(suite)
    currentSuite = prevSuite
  }
}

function it(name, fn) {
  if (!currentSuite) {
    throw new Error('it() must be called inside describe()')
  }
  currentSuite.tests.push({ name, fn, skip: false })
}

function itSkip(name, fn) {
  if (!currentSuite) {
    throw new Error('it.skip() must be called inside describe()')
  }
  currentSuite.tests.push({ name, fn, skip: true })
}

function beforeAll(fn) {
  if (!currentSuite) {
    throw new Error('beforeAll() must be called inside describe()')
  }
  currentSuite.beforeAllFns.push(fn)
}

function afterAll(fn) {
  if (!currentSuite) {
    throw new Error('afterAll() must be called inside describe()')
  }
  currentSuite.afterAllFns.push(fn)
}

function beforeEach(fn) {
  if (!currentSuite) {
    throw new Error('beforeEach() must be called inside describe()')
  }
  currentSuite.beforeEachFns.push(fn)
}

function afterEach(fn) {
  if (!currentSuite) {
    throw new Error('afterEach() must be called inside describe()')
  }
  currentSuite.afterEachFns.push(fn)
}

function runSuite(suite) {
  console.log('\n' + color('bold', color('cyan', '  ' + suite.name)))

  for (const fn of suite.beforeAllFns) {
    try {
      fn()
    } catch (err) {
      console.log('    ' + color('red', 'beforeAll failed:') + ' ' + err.message)
      return
    }
  }

  for (const test of suite.tests) {
    stats.total++

    if (test.skip) {
      stats.skipped++
      console.log('    ' + color('yellow', '○') + ' ' + color('dim', test.name) + ' ' + color('gray', '(skipped)'))
      continue
    }

    for (const fn of suite.beforeEachFns) {
      try { fn() } catch (e) {}
    }

    const testStart = Date.now()
    try {
      test.fn()
      const duration = Date.now() - testStart
      stats.passed++
      console.log('    ' + color('green', '✓') + ' ' + test.name + ' ' + color('gray', '(' + duration + 'ms)'))
    } catch (err) {
      const duration = Date.now() - testStart
      stats.failed++
      stats.failures.push({
        suite: suite.name,
        test: test.name,
        error: err,
        duration
      })
      console.log('    ' + color('red', '✗') + ' ' + color('red', test.name) + ' ' + color('gray', '(' + duration + 'ms)'))
      console.log('      ' + color('dim', err.message))
      if (err.expected !== undefined) {
        console.log('      ' + color('green', 'Expected:') + ' ' + JSON.stringify(err.expected))
        console.log('      ' + color('red', 'Actual:') + '   ' + JSON.stringify(err.actual))
      }
    }

    for (const fn of suite.afterEachFns) {
      try { fn() } catch (e) {}
    }
  }

  for (const fn of suite.afterAllFns) {
    try { fn() } catch (e) {}
  }
}

function printSummary() {
  const totalTime = Date.now() - stats.startTime

  console.log('\n' + color('bold', color('cyan', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')))
  console.log('\n' + color('bold', '  测试结果汇总') + '\n')

  console.log('  总测试数:    ' + color('bold', stats.total))
  console.log('  通过:        ' + color('green', stats.passed))
  console.log('  失败:        ' + (stats.failed > 0 ? color('red', stats.failed) : color('gray', '0')))
  console.log('  跳过:        ' + color('yellow', stats.skipped))
  console.log('  测试套件:    ' + stats.suites)
  console.log('  总耗时:      ' + totalTime + 'ms\n')

  if (stats.failures.length > 0) {
    console.log(color('bold', color('red', '  失败的测试:')) + '\n')
    stats.failures.forEach(function(f, i) {
      console.log('  ' + (i + 1) + '. ' + color('magenta', f.suite) + ' > ' + color('red', f.test))
      console.log('     ' + color('dim', f.error.message))
      if (f.error.stack) {
        const stackLines = f.error.stack.split('\n').slice(1, 4)
        stackLines.forEach(function(line) {
          console.log('     ' + color('gray', line.trim()))
        })
      }
      console.log('')
    })
  }

  const passRate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : 0
  const barWidth = 40
  const filled = Math.floor((stats.passed / Math.max(stats.total, 1)) * barWidth)
  const bar = color('green', '█'.repeat(filled)) + color('red', '█'.repeat(barWidth - filled))

  console.log('  ' + bar + ' ' + color('bold', passRate + '%') + '\n')

  if (stats.failed > 0) {
    console.log('  ' + color('bgRed', color('bold', ' 测试失败 ')) + '\n')
  } else {
    console.log('  ' + color('bgGreen', color('bold', ' 所有测试通过 ')) + '\n')
  }

  process.exit(stats.failed > 0 ? 1 : 0)
}

function runTests() {
  const args = process.argv.slice(2)
  const testsDir = path.join(__dirname, 'writer-os')

  let testFiles = []

  if (args.length > 0) {
    for (const arg of args) {
      let filePath = arg
      if (!path.isAbsolute(filePath)) {
        filePath = path.join(testsDir, arg)
      }
      if (!filePath.endsWith('.cjs')) {
        filePath += '.cjs'
      }
      if (fs.existsSync(filePath)) {
        testFiles.push(filePath)
      } else {
        console.log(color('red', '测试文件不存在: ' + arg))
        process.exit(1)
      }
    }
  } else {
    if (fs.existsSync(testsDir)) {
      testFiles = fs.readdirSync(testsDir)
        .filter(function(f) { return f.startsWith('test-') && f.endsWith('.cjs') })
        .map(function(f) { return path.join(testsDir, f) })
        .sort()
    }
  }

  if (testFiles.length === 0) {
    console.log(color('yellow', '没有找到测试文件'))
    process.exit(0)
  }

  stats.startTime = Date.now()

  console.log('\n' + color('bold', color('cyan', '╔══════════════════════════════════════════════════╗')))
  console.log(color('bold', color('cyan', '║          Karna Writer-OS 单元测试套件                ║')))
  console.log(color('bold', color('cyan', '╚══════════════════════════════════════════════════╝')))
  console.log('\n' + color('dim', '  找到 ' + testFiles.length + ' 个测试文件'))

  for (const file of testFiles) {
    try {
      require(file)
    } catch (err) {
      console.log('\n' + color('red', '加载测试文件失败:') + ' ' + path.basename(file))
      console.log('  ' + err.message)
      console.log(err.stack)
      stats.failed++
    }
  }

  printSummary()
}

module.exports = {
  describe,
  it,
  itSkip: itSkip,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  assert,
  stats,
  color,
  COLORS
}

if (require.main === module) {
  runTests()
}
