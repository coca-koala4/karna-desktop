"use strict"

const fs = require("fs")
const path = require("path")
const ts = require("typescript")

const DESKTOP_ROOT = path.resolve(__dirname, "..")
const SRC_ROOT = path.join(DESKTOP_ROOT, "src")
const I18N_ROOT = path.join(SRC_ROOT, "i18n")

const LOCALE_FILES = {
  zh: path.join(I18N_ROOT, "zh.ts"),
  en: path.join(I18N_ROOT, "en.ts"),
  ja: path.join(I18N_ROOT, "ja.ts"),
  "zh-hant": path.join(I18N_ROOT, "zh-hant.ts")
}

const CHINESE_REGEX = /[\u4e00-\u9fa5]+/g
const REPLACEMENT_CHAR = "\uFFFD"
const TSX_FILE_PATTERN = /\.tsx$/

function walkDir(dir, callback) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
        continue
      }
      walkDir(fullPath, callback)
    } else if (entry.isFile()) {
      callback(fullPath)
    }
  }
}

function extractChineseStrings(content) {
  const matches = content.match(CHINESE_REGEX)
  return matches ? [...new Set(matches)] : []
}

function countReplacementChars(content) {
  let count = 0
  for (const char of content) {
    if (char === REPLACEMENT_CHAR) {
      count++
    }
  }
  return count
}

function propertyName(name) {
  if (!name) return ""
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return ""
}

function extractKeysFromLocale(content, filePath) {
  const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const keys = new Set()
  let root = null
  let hasFallback = false
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializer = node.initializer
      if (ts.isObjectLiteralExpression(initializer)) root = initializer
      if (ts.isCallExpression(initializer)) {
        const objectArgument = initializer.arguments.find(argument => ts.isObjectLiteralExpression(argument))
        if (objectArgument && ts.isObjectLiteralExpression(objectArgument)) {
          root = objectArgument
          hasFallback = initializer.expression.getText(source) === "defineLocale"
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!root) return { keys, hasFallback }

  const collect = (object, prefix = "") => {
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) continue
      const key = propertyName(property.name)
      if (!key) continue
      const fullKey = prefix ? `${prefix}.${key}` : key
      if (ts.isPropertyAssignment(property) && ts.isObjectLiteralExpression(property.initializer)) collect(property.initializer, fullKey)
      else keys.add(fullKey)
    }
  }
  collect(root)
  return { keys, hasFallback }
}

function readLocaleKeys(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8")
    return extractKeysFromLocale(content, filePath)
  } catch {
    return { keys: new Set(), hasFallback: false }
  }
}

function main() {
  console.log("=== i18n 检查报告 ===\n")

  const report = {
    hardcodedChinese: [],
    replacementChars: [],
    missingTranslations: {},
    fallbackTranslations: {}
  }

  console.log("1. 扫描 TSX 文件...")
  const tsxFiles = []
  walkDir(SRC_ROOT, filePath => {
    if (TSX_FILE_PATTERN.test(filePath)) {
      tsxFiles.push(filePath)
    }
  })

  let totalReplacementChars = 0
  const chineseStrings = new Set()

  for (const filePath of tsxFiles) {
    const relativePath = path.relative(DESKTOP_ROOT, filePath)
    const content = fs.readFileSync(filePath, "utf8")

    const chinese = extractChineseStrings(content)
    if (chinese.length > 0) {
      report.hardcodedChinese.push({
        file: relativePath,
        strings: chinese
      })
      chinese.forEach(s => chineseStrings.add(s))
    }

    const replacementCount = countReplacementChars(content)
    if (replacementCount > 0) {
      report.replacementChars.push({
        file: relativePath,
        count: replacementCount
      })
      totalReplacementChars += replacementCount
    }
  }

  console.log("2. 检查多语言翻译...")
  const localeKeys = {}
  for (const [locale, filePath] of Object.entries(LOCALE_FILES)) {
    localeKeys[locale] = readLocaleKeys(filePath)
  }

  const zhKeys = localeKeys.zh.keys
  const missingByLocale = {}
  for (const locale of Object.keys(LOCALE_FILES)) {
    if (locale === "zh") continue
    const missing = []
    for (const key of zhKeys) {
      if (!localeKeys[locale].keys.has(key)) {
        missing.push(key)
      }
    }
    if (missing.length > 0) {
      if (localeKeys[locale].hasFallback) report.fallbackTranslations[locale] = missing
      else missingByLocale[locale] = missing
    }
  }
  report.missingTranslations = missingByLocale

  console.log("\n" + "=".repeat(60))
  console.log("检查结果:")
  console.log("=".repeat(60))

  console.log(`\n📊 统计摘要:`)
  console.log(`  - 扫描 TSX 文件数: ${tsxFiles.length}`)
  console.log(`  - 硬编码中文字符串: ${chineseStrings.size} 个唯一字符串 (在 ${report.hardcodedChinese.length} 个文件中)`)
  console.log(`  - 替换字符(�)数量: ${totalReplacementChars} 个 (在 ${report.replacementChars.length} 个文件中)`)

  let totalMissing = 0
  for (const locale of Object.keys(missingByLocale)) {
    totalMissing += missingByLocale[locale].length
  }
  console.log(`  - 未翻译 key 数量: ${totalMissing} 个`)

  if (report.hardcodedChinese.length > 0) {
    console.log(`\n⚠️  发现硬编码中文字符串的文件:`)
    for (const item of report.hardcodedChinese.slice(0, 20)) {
      console.log(`  - ${item.file}: ${item.strings.slice(0, 5).join(", ")}${item.strings.length > 5 ? "..." : ""}`)
    }
    if (report.hardcodedChinese.length > 20) {
      console.log(`  ... 还有 ${report.hardcodedChinese.length - 20} 个文件`)
    }
  }

  if (report.replacementChars.length > 0) {
    console.log(`\n⚠️  发现替换字符(�)的文件:`)
    for (const item of report.replacementChars) {
      console.log(`  - ${item.file}: ${item.count} 个`)
    }
  }

  if (Object.keys(missingByLocale).length > 0) {
    console.log(`\n⚠️  未翻译的 key:`)
    for (const [locale, keys] of Object.entries(missingByLocale)) {
      console.log(`  [${locale}] 缺失 ${keys.length} 个 key:`)
      for (const key of keys.slice(0, 10)) {
        console.log(`    - ${key}`)
      }
      if (keys.length > 10) {
        console.log(`    ... 还有 ${keys.length - 10} 个`)
      }
    }
  }

  if (Object.keys(report.fallbackTranslations).length > 0) {
    console.log(`\nℹ️  使用 English fallback 的未翻译 key（不阻断）：`)
    for (const [locale, keys] of Object.entries(report.fallbackTranslations)) {
      console.log(`  [${locale}] ${keys.length} 个 key 使用 fallback`)
    }
  }

  console.log("\n" + "=".repeat(60))

  // Existing Chinese-first UI still contains literal copy. Keep that inventory
  // visible, but only fail the gate for actual encoding corruption or locale-key drift.
  const hasIssues = totalReplacementChars > 0 || totalMissing > 0
  if (hasIssues) {
    console.log("❌ i18n 检查发现问题，请修复后再提交。")
    process.exit(1)
  } else {
    console.log("✅ i18n 检查通过！")
    process.exit(0)
  }
}

main()
