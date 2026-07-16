'use strict'

const fs = require('fs')
const path = require('path')

const GARBLED_SEQUENCES = [
  '鑺傜偣',
  '妯″瀷',
  '鐭ヨ瘑',
  '鎶€鑳',
  '宸ヤ綔娴',
  '閰嶇疆',
  '鑳藉姏',
  '鑺傜偣灞炴€',
  '鎻掍欢',
  '宸ュ叿',
  '鐏甸瓊',
  '妗ｆ',
  '鍥炴墽',
  '鎵ц',
  '纭',
  '鍒犻櫎',
  '淇濆瓨',
  '杩愯',
  '鑺傜偣閰嶇疆',
  '鐭ヨ瘑搴'
]

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.vue', '.json', '.css', '.scss', '.md'])
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'out', 'release', 'coverage'])
const EXCLUDE_FILES = new Set(['check-garbled-text.cjs'])

function walkDir(dir, fileList = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walkDir(fullPath, fileList)
        }
      } else {
        if (EXCLUDE_FILES.has(entry.name)) continue
        const ext = path.extname(entry.name).toLowerCase()
        if (SOURCE_EXTENSIONS.has(ext)) {
          fileList.push(fullPath)
        }
      }
    }
  } catch {}
  return fileList
}

function checkFile(filePath) {
  const findings = []
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    for (const seq of GARBLED_SEQUENCES) {
      if (content.includes(seq)) {
        const lines = content.split('\n')
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum]
          const idx = line.indexOf(seq)
          if (idx >= 0) {
            findings.push({
              file: filePath,
              line: lineNum + 1,
              sequence: seq,
              text: line.trim().slice(0, 150),
              column: idx + 1
            })
          }
        }
      }
    }

    const replacementChar = content.includes('\uFFFD')
    if (replacementChar) {
      const lines = content.split('\n')
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        if (lines[lineNum].includes('\uFFFD')) {
          findings.push({
            file: filePath,
            line: lineNum + 1,
            sequence: '� (replacement character)',
            text: lines[lineNum].trim().slice(0, 150),
            column: lines[lineNum].indexOf('\uFFFD') + 1
          })
        }
      }
    }
  } catch (e) {}
  return findings
}

function fixFile(filePath, findings) {
  const garbleMap = {
    '鑺傜偣': '节点',
    '妯″瀷': '模型',
    '鐭ヨ瘑': '知识',
    '鎶€鑳': '技能',
    '宸ヤ綔娴': '工作流',
    '閰嶇疆': '配置',
    '鑳藉姏': '能力',
    '鑺傜偣灞炴€?': '节点属性',
    '鎻掍欢': '插件',
    '宸ュ叿': '工具',
    '鐏甸瓊': '灵魂',
    '妗ｆ': '档案',
    '鍥炴墽': '回放',
    '鎵ц': '执行',
    '纭': '确认',
    '鍒犻櫎': '删除',
    '淇濆瓨': '保存',
    '杩愯': '运行',
    '鑺傜偣閰嶇疆': '节点配置',
    '鐭ヨ瘑搴': '知识库'
  }

  try {
    let content = fs.readFileSync(filePath, 'utf8')
    let fixed = 0
    for (const finding of findings) {
      const replacement = garbleMap[finding.sequence]
      if (replacement && content.includes(finding.sequence)) {
        content = content.split(finding.sequence).join(replacement)
        fixed++
      }
    }
    if (fixed > 0) {
      fs.writeFileSync(filePath, content, 'utf8')
      return fixed
    }
  } catch (e) {}
  return 0
}

function main() {
  const shouldFix = process.argv.includes('--fix')
  const targetDir = process.argv[2] && !process.argv[2].startsWith('--')
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, '..')

  const srcDir = path.join(targetDir, 'src')
  const electronDir = path.join(targetDir, 'electron')

  console.log('=== Karna Garbled Text Checker ===\n')
  console.log('Mode:', shouldFix ? 'FIX' : 'CHECK')
  console.log('Scanning:', targetDir)
  console.log()

  const dirs = []
  if (fs.existsSync(srcDir)) dirs.push(srcDir)
  if (fs.existsSync(electronDir)) dirs.push(electronDir)
  if (dirs.length === 0) dirs.push(targetDir)

  const files = []
  for (const dir of dirs) {
    walkDir(dir, files)
  }

  console.log(`Found ${files.length} source files to check...\n`)

  const allFindings = []
  for (const file of files) {
    const findings = checkFile(file)
    allFindings.push(...findings)
  }

  if (allFindings.length === 0) {
    console.log('✅ No garbled text (mojibake) found!')
    process.exit(0)
  }

  const filesWithIssues = new Map()
  for (const finding of allFindings) {
    if (!filesWithIssues.has(finding.file)) filesWithIssues.set(finding.file, [])
    filesWithIssues.get(finding.file).push(finding)
  }

  console.log(`⚠️  Found ${allFindings.length} garbled text instances in ${filesWithIssues.size} files:\n`)

  let totalFixed = 0
  for (const [file, findings] of filesWithIssues) {
    const relFile = path.relative(targetDir, file)
    console.log(`📄 ${relFile}`)
    for (const f of findings.slice(0, 15)) {
      console.log(`   Line ${f.line}: found "${f.sequence}" → "${f.text.slice(0, 80)}"`)
    }
    if (findings.length > 15) {
      console.log(`   ... and ${findings.length - 15} more issues`)
    }
    console.log()

    if (shouldFix) {
      const fixed = fixFile(file, findings)
      if (fixed > 0) {
        console.log(`   🔧 Fixed ${fixed} sequences`)
        totalFixed += fixed
      }
    }
  }

  console.log('=== Summary ===')
  console.log(`Total files with issues: ${filesWithIssues.size}`)
  console.log(`Total garbled sequences: ${allFindings.length}`)

  if (shouldFix) {
    console.log(`Total fixed: ${totalFixed}`)
  } else {
    console.log('\nRun with --fix to automatically replace known garbled sequences.')
  }

  if (process.argv.includes('--ci')) {
    process.exit(filesWithIssues.size > 0 ? 1 : 0)
  }
}

main()
