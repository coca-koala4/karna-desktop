"use strict"

const fs = require("fs")
const path = require("path")

const DESKTOP_ROOT = path.resolve(__dirname, "..")
const SRC_ROOT = path.join(DESKTOP_ROOT, "src")
const TSX_FILE_PATTERN = /\.tsx$/

const issues = {
  errors: [],
  warnings: [],
  infos: []
}

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

function getLineNumber(content, index) {
  return content.substring(0, index).split("\n").length
}

function checkModalEscHandler(content, filePath, relativePath) {
  const modalRegex = /(?:function\s+\w*Modal\w*|const\s+\w*Modal\w*\s*=|class\s+\w*Modal\w*|<Modal\b|<Dialog\b)/gi
  const radixDialogRegex = /@radix-ui|DialogContent|DialogPortal|from\s+["'][^"']*dialog[^"']*["']/i
  const onKeyDownRegex = /onKeyDown\s*=/
  const escapeRegex = /(?:Escape|key\s*==?=\s*["']Escape["']|keyCode\s*==?=\s*27|which\s*==?=\s*27)/
  // Local Modal implementations centralize Escape handling. Calls into one of
  // these components must not be reported as if they were raw dialogs.
  const hasSharedModalEscape = /function\s+Modal\b[\s\S]{0,2500}?(?:Escape|key\s*===\s*["']Escape["'])/i.test(content)
  const hasSharedDialogFocus = /function\s+Modal\b[\s\S]{0,1200}?useDialogFocus\s*</i.test(content)

  let match
  while ((match = modalRegex.exec(content)) !== null) {
    const startIdx = match.index
    const endIdx = Math.min(content.length, startIdx + 5000)
    const context = content.substring(startIdx, endIdx)

    const token = match[0]
    const isRadixDialog = radixDialogRegex.test(context)
    if (isRadixDialog) continue

    if (/useDialogFocus\s*</.test(context)) continue

    const delegatesToSharedModal = (hasSharedModalEscape || hasSharedDialogFocus) && (token.startsWith('<Modal') || (token.startsWith('function') && /<Modal\b/.test(context)))
    if (delegatesToSharedModal) continue

    const hasOnKeyDown = onKeyDownRegex.test(context)
    const hasEscapeHandler = escapeRegex.test(context)

    if (!hasOnKeyDown || !hasEscapeHandler) {
      const line = getLineNumber(content, startIdx)
      issues.errors.push({
        file: relativePath,
        line,
        message: "Modal without Esc key handler",
        type: "modal-no-esc"
      })
    }
  }
}

function checkImgAlt(content, filePath, relativePath) {
  const imgRegex = /<img\b[^>]*>/gi
  let match
  while ((match = imgRegex.exec(content)) !== null) {
    const imgTag = match[0]
    const hasAlt = /\balt\s*=/.test(imgTag)
    if (!hasAlt) {
      const line = getLineNumber(content, match.index)
      issues.warnings.push({
        file: relativePath,
        line,
        message: "Image missing alt attribute",
        type: "img-no-alt"
      })
    }
  }
}

function checkIconButtonAriaLabel(content, filePath, relativePath) {
  const buttonRegex = /<button\b[^>]*>[\s\S]*?<\/button>/gi
  let match
  while ((match = buttonRegex.exec(content)) !== null) {
    const buttonTag = match[0]
    const openTag = buttonTag.match(/<button\b[^>]*>/i)[0]
    const hasTextContent = />([^<]*[a-zA-Z\u4e00-\u9fa5][^<]*)<\//.test(buttonTag)
    const hasIconOnly = /<(?:Icon|svg|img\b|@?tabler|@icons-pack|Lucide|Icon\w+)/i.test(buttonTag) && !hasTextContent
    
    if (hasIconOnly) {
      const hasAriaLabel = /\baria-label\s*=/.test(openTag)
      const hasTitle = /\btitle\s*=/.test(openTag)
      const hasAriaLabelledBy = /\baria-labelledby\s*=/.test(openTag)
      
      if (!hasAriaLabel && !hasTitle && !hasAriaLabelledBy) {
        const line = getLineNumber(content, match.index)
        issues.warnings.push({
          file: relativePath,
          line,
          message: "Icon button missing aria-label or title",
          type: "button-no-label"
        })
      }
    }
  }
}

function checkHardcodedColors(content, filePath, relativePath) {
  const colorRegex = /(?:^|[^-\w])color\s*:\s*["']?\s*#([0-9a-fA-F]{3,8})\s*["']?/gm
  let match
  while ((match = colorRegex.exec(content)) !== null) {
    const line = getLineNumber(content, match.index)
    issues.infos.push({
      file: relativePath,
      line,
      message: `Hardcoded color #${match[1]} - check contrast ratio`,
      type: "hardcoded-color"
    })
  }

  const bgColorRegex = /(?:^|[^-\w])background(?:-color)?\s*:\s*["']?\s*#([0-9a-fA-F]{3,8})\s*["']?/gm
  while ((match = bgColorRegex.exec(content)) !== null) {
    const line = getLineNumber(content, match.index)
    issues.infos.push({
      file: relativePath,
      line,
      message: `Hardcoded background color #${match[1]} - check contrast ratio`,
      type: "hardcoded-color"
    })
  }
}

function checkTabindexPositive(content, filePath, relativePath) {
  const tabindexRegex = /tabindex\s*=\s*["']?\s*(\d+)\s*["']?/gi
  let match
  while ((match = tabindexRegex.exec(content)) !== null) {
    const value = parseInt(match[1], 10)
    if (value > 0) {
      const line = getLineNumber(content, match.index)
      issues.warnings.push({
        file: relativePath,
        line,
        message: `tabindex="${value}" > 0, use natural DOM order instead`,
        type: "tabindex-positive"
      })
    }
  }
}

function checkFormLabels(content, filePath, relativePath) {
  const inputRegex = /<(input|select|textarea)\b([^>]*?)(?:\/?>|>)/gi
  let match

  const labelIds = new Set()
  const labelForRegex = /<label\b[^>]*\bhtmlFor\s*=\s*["']([^"']+)["'][^>]*>/gi
  let labelMatch
  while ((labelMatch = labelForRegex.exec(content)) !== null) {
    labelIds.add(labelMatch[1])
  }

  const wrappedLabelRegex = /<label\b[^>]*>[\s\S]*?<(input|select|textarea)\b/gi
  while ((labelMatch = wrappedLabelRegex.exec(content)) !== null) {
    const inputStart = labelMatch.index + labelMatch[0].indexOf("<" + labelMatch[1])
    const inputTag = content.substring(inputStart).match(/<(input|select|textarea)\b[^>]*(?:\/?>|>)/i)[0]
    const idMatch = inputTag.match(/\bid\s*=\s*["']([^"']+)["']/i)
    if (idMatch) {
      labelIds.add(idMatch[1])
    } else {
      continue
    }
  }

  while ((match = inputRegex.exec(content)) !== null) {
    const tag = match[0]
    const tagName = match[1]
    const attrs = match[2]

    const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)
    if (typeMatch && ["hidden", "submit", "reset", "button"].includes(typeMatch[1].toLowerCase())) {
      continue
    }

    const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i)
    const ariaLabelMatch = attrs.match(/\baria-label\s*=\s*["']([^"']+)["']/i)
    const ariaLabelledByMatch = attrs.match(/\baria-labelledby\s*=\s*["']([^"']+)["']/i)
    const titleMatch = attrs.match(/\btitle\s*=\s*["']([^"']+)["']/i)

    const hasLabel = (idMatch && labelIds.has(idMatch[1])) ||
                    ariaLabelMatch ||
                    ariaLabelledByMatch ||
                    titleMatch

    if (!hasLabel) {
      const line = getLineNumber(content, match.index)
      issues.warnings.push({
        file: relativePath,
        line,
        message: `${tagName} missing associated label`,
        type: "input-no-label"
      })
    }
  }
}

function main() {
  console.log("=== A11y Static Check ===\n")

  const tsxFiles = []
  walkDir(SRC_ROOT, filePath => {
    if (TSX_FILE_PATTERN.test(filePath)) {
      tsxFiles.push(filePath)
    }
  })

  console.log(`Scanned: ${tsxFiles.length} .tsx files\n`)

  for (const filePath of tsxFiles) {
    const relativePath = path.relative(DESKTOP_ROOT, filePath).replace(/\\/g, "/")
    const content = fs.readFileSync(filePath, "utf8")

    checkModalEscHandler(content, filePath, relativePath)
    checkImgAlt(content, filePath, relativePath)
    checkIconButtonAriaLabel(content, filePath, relativePath)
    checkHardcodedColors(content, filePath, relativePath)
    checkTabindexPositive(content, filePath, relativePath)
    checkFormLabels(content, filePath, relativePath)
  }

  const errorGroups = {}
  const warningGroups = {}
  const infoGroups = {}

  for (const issue of issues.errors) {
    if (!errorGroups[issue.message]) errorGroups[issue.message] = []
    errorGroups[issue.message].push(`${issue.file}:${issue.line}`)
  }

  for (const issue of issues.warnings) {
    if (!warningGroups[issue.message]) warningGroups[issue.message] = []
    warningGroups[issue.message].push(`${issue.file}:${issue.line}`)
  }

  for (const issue of issues.infos) {
    if (!infoGroups[issue.message]) infoGroups[issue.message] = []
    infoGroups[issue.message].push(`${issue.file}:${issue.line}`)
  }

  const hasIssues = issues.errors.length > 0 || issues.warnings.length > 0 || issues.infos.length > 0

  if (!hasIssues) {
    console.log("No a11y issues found!")
  } else {
    for (const [message, files] of Object.entries(errorGroups)) {
      console.log(`[ERROR] ${message}:`)
      for (const file of files) {
        console.log(`  - ${file}`)
      }
      console.log()
    }

    for (const [message, files] of Object.entries(warningGroups)) {
      console.log(`[WARNING] ${message}:`)
      for (const file of files.slice(0, 50)) {
        console.log(`  - ${file}`)
      }
      if (files.length > 50) {
        console.log(`  ... and ${files.length - 50} more`)
      }
      console.log()
    }

    for (const [message, files] of Object.entries(infoGroups)) {
      console.log(`[INFO] ${message}:`)
      for (const file of files.slice(0, 20)) {
        console.log(`  - ${file}`)
      }
      if (files.length > 20) {
        console.log(`  ... and ${files.length - 20} more`)
      }
      console.log()
    }
  }

  console.log(`Summary: ${issues.errors.length} errors, ${issues.warnings.length} warnings, ${issues.infos.length} infos`)

  if (issues.errors.length > 0) {
    process.exit(1)
  }
}

main()
