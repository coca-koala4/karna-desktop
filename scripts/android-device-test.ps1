# Android 真机测试脚本
# 使用方法: .\scripts\android-device-test.ps1 [-SkipBuild] [-SkipInstall] [-TestOnly]

param(
    [switch]$SkipBuild,
    [switch]$SkipInstall,
    [switch]$TestOnly
)

# ============================================
# 配置常量
# ============================================

# ADB 可执行文件路径
$ADB_PATH = "C:\Users\26873\AppData\Local\Android\Sdk\platform-tools\adb.exe"

# 项目根目录
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot

# 构建输出目录
$BUILD_OUTPUT_DIR = Join-Path $PROJECT_ROOT "build"
$REPORTS_DIR = Join-Path $BUILD_OUTPUT_DIR "android-test-reports"

# APK 路径模式 (Gradle 构建输出)
$DEBUG_APK_PATTERN = "app-debug.apk"
$ANDROID_TEST_APK_PATTERN = "app-debug-androidTest.apk"

# ============================================
# 辅助函数：彩色输出
# ============================================

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK]   $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Error2 {
    param([string]$Message)
    Write-Host "[ERR]  $Message" -ForegroundColor Red
}

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Magenta
    Write-Host "  $Message" -ForegroundColor Magenta
    Write-Host "========================================" -ForegroundColor Magenta
}

# ============================================
# 步骤 0: 初始化检查
# ============================================

Write-Step "初始化 Android 真机测试环境"

# 检查 ADB 是否存在
if (-not (Test-Path $ADB_PATH)) {
    Write-Error2 "ADB 未找到: $ADB_PATH"
    Write-Error2 "请确认 Android SDK Platform Tools 已安装"
    exit 1
}
Write-Success "ADB 路径验证通过: $ADB_PATH"

# 创建报告输出目录
if (-not (Test-Path $REPORTS_DIR)) {
    New-Item -ItemType Directory -Path $REPORTS_DIR -Force | Out-Null
    Write-Info "创建报告目录: $REPORTS_DIR"
} else {
    Write-Info "报告目录已存在: $REPORTS_DIR"
}

# 清理旧的 logcat 缓存
& $ADB_PATH logcat -c 2>$null
Write-Info "已清理 logcat 缓存"

# ============================================
# 步骤 1: 检查真机连接
# ============================================

Write-Step "检查真机设备连接"

# 获取设备列表
$devicesOutput = & $ADB_PATH devices
$devices = @()
foreach ($line in $devicesOutput) {
    if ($line -match '^(\S+)\s+device$') {
        $devices += $Matches[1]
    }
}

# 过滤掉 emulator 开头的设备
$realDevices = @()
$emulatorDevices = @()
foreach ($dev in $devices) {
    if ($dev -like "emulator-*") {
        $emulatorDevices += $dev
    } else {
        $realDevices += $dev
    }
}

# 提示模拟器设备
if ($emulatorDevices.Count -gt 0) {
    Write-Warn "检测到以下模拟器设备（将被忽略）:"
    foreach ($emu in $emulatorDevices) {
        Write-Warn "  - $emu"
    }
}

# 检查是否有真机连接
if ($realDevices.Count -eq 0) {
    Write-Error2 "未检测到已连接的真机设备！"
    Write-Error2 "请:"
    Write-Error2 "  1. 用 USB 连接 Android 设备"
    Write-Error2 "  2. 在设备上启用 USB 调试"
    Write-Error2 "  3. 授权此电脑进行调试"
    Write-Error2 "  4. 确认设备状态为 'device' (不是 unauthorized 或 offline)"
    exit 1
}

# 选择第一个真机作为目标设备
$TARGET_DEVICE = $realDevices[0]
Write-Success "找到真机设备: $TARGET_DEVICE"

# 获取设备信息
Write-Info "设备型号: $(($(& $ADB_PATH -s $TARGET_DEVICE shell getprop ro.product.model) -join ''))"
Write-Info "Android 版本: $(($(& $ADB_PATH -s $TARGET_DEVICE shell getprop ro.build.version.release) -join ''))"
Write-Info "SDK 版本: $(($(& $ADB_PATH -s $TARGET_DEVICE shell getprop ro.build.version.sdk) -join ''))"

# ============================================
# 步骤 2: 构建 Debug APK
# ============================================

if (-not $SkipBuild -and -not $TestOnly) {
    Write-Step "构建 Debug APK"

    # 检查 gradlew 是否存在
    $gradlewPath = Join-Path $PROJECT_ROOT "gradlew.bat"
    if (-not (Test-Path $gradlewPath)) {
        # Android 项目位于 apps\android 目录
        Write-Info "在项目根目录未找到 gradlew.bat，使用 apps\android 目录..."
        $possibleAndroidDirs = @(
            (Join-Path $PROJECT_ROOT "apps\android")
        )
        $gradlewPath = $null
        foreach ($dir in $possibleAndroidDirs) {
            $candidate = Join-Path $dir "gradlew.bat"
            if (Test-Path $candidate) {
                $gradlewPath = $candidate
                $ANDROID_PROJECT_DIR = $dir
                break
            }
        }
        if (-not $gradlewPath) {
            Write-Error2 "未找到 gradlew.bat，无法构建 APK"
            Write-Error2 "请先在 apps\android 目录下运行 Gradle wrapper 生成脚本，或使用 -SkipBuild 跳过构建"
            exit 1
        }
        Write-Info "找到 Android 项目目录: $ANDROID_PROJECT_DIR"
    } else {
        $ANDROID_PROJECT_DIR = $PROJECT_ROOT
    }

    Push-Location $ANDROID_PROJECT_DIR
    try {
        # 确保 gradlew.bat 有执行权限 (Windows)
        if (-not (Get-Item $gradlewPath).IsReadOnly) {
            # 检查 wrapper 配置
            $wrapperProps = Join-Path $ANDROID_PROJECT_DIR "gradle\wrapper\gradle-wrapper.properties"
            if (Test-Path $wrapperProps) {
                Write-Info "Gradle wrapper 配置已就绪"
            }
        }

        Write-Info "执行: .\gradlew.bat assembleDebug assembleAndroidTest"
        & .\gradlew.bat assembleDebug assembleAndroidTest
        if ($LASTEXITCODE -ne 0) {
            Write-Error2 "构建失败！请检查 Gradle 输出"
            exit 1
        }
        Write-Success "Debug APK 构建成功"
    } finally {
        Pop-Location
    }
} elseif ($SkipBuild) {
    # 如果跳过构建，仍需要设置 ANDROID_PROJECT_DIR
    if (-not $ANDROID_PROJECT_DIR) {
        $ANDROID_PROJECT_DIR = Join-Path $PROJECT_ROOT "apps\android"
    }
    Write-Warn "跳过构建步骤 (-SkipBuild)"
} elseif ($TestOnly) {
    if (-not $ANDROID_PROJECT_DIR) {
        $ANDROID_PROJECT_DIR = Join-Path $PROJECT_ROOT "apps\android"
    }
    Write-Warn "仅执行测试模式 (-TestOnly)"
}

# ============================================
# 步骤 3: 查找 APK 文件
# ============================================

Write-Step "查找 APK 文件"

# 查找构建输出目录
if (-not $ANDROID_PROJECT_DIR) {
    $ANDROID_PROJECT_DIR = $PROJECT_ROOT
}

$apkSearchDirs = @(
    (Join-Path $ANDROID_PROJECT_DIR "app\build\outputs\apk\debug"),
    (Join-Path $ANDROID_PROJECT_DIR "build\app\outputs\apk\debug")
)

$debugApkPath = $null
$androidTestApkPath = $null

foreach ($dir in $apkSearchDirs) {
    if (Test-Path $dir) {
        $debugCandidate = Get-ChildItem -Path $dir -Filter $DEBUG_APK_PATTERN -Recurse | Select-Object -First 1
        if ($debugCandidate) {
            $debugApkPath = $debugCandidate.FullName
        }
        $testCandidate = Get-ChildItem -Path $dir -Filter $ANDROID_TEST_APK_PATTERN -Recurse | Select-Object -First 1
        if ($testCandidate) {
            $androidTestApkPath = $testCandidate.FullName
        }
    }
}

if (-not $debugApkPath) {
    # 更广泛的搜索
    Write-Info "在项目中搜索 Debug APK..."
    $debugApkFiles = Get-ChildItem -Path $ANDROID_PROJECT_DIR -Filter $DEBUG_APK_PATTERN -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -like "*\build\outputs\*" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($debugApkFiles) {
        $debugApkPath = $debugApkFiles.FullName
    }
}

if ($debugApkPath) {
    Write-Success "找到 Debug APK: $debugApkPath"
} else {
    Write-Error2 "未找到 Debug APK！请先构建或确认构建输出位置"
    exit 1
}

if ($androidTestApkPath) {
    Write-Success "找到 AndroidTest APK: $androidTestApkPath"
} else {
    Write-Warn "未找到 AndroidTest APK，将跳过 instrumentation 测试"
}

# ============================================
# 步骤 4: 安装 APK 到真机
# ============================================

if (-not $SkipInstall -and -not $TestOnly) {
    Write-Step "安装 APK 到真机"

    # 安装主 APK
    Write-Info "安装主 APK..."
    & $ADB_PATH -s $TARGET_DEVICE install -r -t $debugApkPath
    if ($LASTEXITCODE -ne 0) {
        Write-Error2 "主 APK 安装失败"
        exit 1
    }
    Write-Success "主 APK 安装成功"

    # 安装测试 APK（如果存在）
    if ($androidTestApkPath) {
        Write-Info "安装测试 APK..."
        & $ADB_PATH -s $TARGET_DEVICE install -r -t $androidTestApkPath
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "测试 APK 安装失败，将跳过 instrumentation 测试"
            $androidTestApkPath = $null
        } else {
            Write-Success "测试 APK 安装成功"
        }
    }
} elseif ($SkipInstall) {
    Write-Warn "跳过安装步骤 (-SkipInstall)"
}

# ============================================
# 步骤 5: 执行 Instrumentation 测试
# ============================================

$testRunSuccess = $true
if ($androidTestApkPath) {
    Write-Step "执行 Instrumentation 测试"

    # 获取测试包名
    $testPackageName = $null
    $runnerComponent = $null

    # 尝试从 APK 提取包名（需要 aapt，或者从 AndroidManifest 读取）
    # 这里使用常见的测试 runner
    $defaultTestRunner = "androidx.test.runner.AndroidJUnitRunner"

    # 查找包名 - 尝试从构建目录查找 AndroidManifest
    $manifestPaths = @(
        (Join-Path $ANDROID_PROJECT_DIR "app\build\intermediates\merged_manifest\debug\AndroidManifest.xml"),
        (Join-Path $ANDROID_PROJECT_DIR "app\src\main\AndroidManifest.xml")
    )

    $mainPackageName = $null
    foreach ($manifest in $manifestPaths) {
        if (Test-Path $manifest) {
            $manifestContent = Get-Content $manifest -Raw
            if ($manifestContent -match 'package="([^"]+)"') {
                $mainPackageName = $Matches[1]
                break
            }
        }
    }

    if (-not $mainPackageName) {
        # 尝试从设备获取已安装的包
        Write-Info "无法从 Manifest 获取包名，尝试从设备查找..."
        $packages = & $ADB_PATH -s $TARGET_DEVICE shell pm list packages
        foreach ($pkg in $packages) {
            if ($pkg -like "package:*karna*" -or $pkg -like "package:*hermes*") {
                $mainPackageName = $pkg -replace "package:", ""
                Write-Info "找到候选包名: $mainPackageName"
                break
            }
        }
    }

    if ($mainPackageName) {
        $testPackageName = "$mainPackageName.test"
        $runnerComponent = "$testPackageName/$defaultTestRunner"

        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        $logcatFile = Join-Path $REPORTS_DIR "logcat_test_$timestamp.log"
        $testResultFile = Join-Path $REPORTS_DIR "test_results_$timestamp.txt"

        Write-Info "开始记录 logcat 到: $logcatFile"
        $logcatProc = Start-Process -FilePath $ADB_PATH -ArgumentList "-s", $TARGET_DEVICE, "logcat", "-v", "time" -RedirectStandardOutput $logcatFile -NoNewWindow -PassThru

        Start-Sleep -Seconds 2

        Write-Info "执行测试: adb shell am instrument -w $runnerComponent"
        & $ADB_PATH -s $TARGET_DEVICE shell am instrument -w $runnerComponent 2>&1 | Tee-Object -FilePath $testResultFile
        $testExitCode = $LASTEXITCODE

        Start-Sleep -Seconds 2

        # 停止 logcat
        try {
            Stop-Process -Id $logcatProc.Id -Force -ErrorAction SilentlyContinue
        } catch {}

        # 检查测试结果
        $testOutput = Get-Content $testResultFile -Raw
        if ($testOutput -match "OK \(" -and $testExitCode -eq 0) {
            Write-Success "所有 Instrumentation 测试通过!"
        } else {
            Write-Warn "部分测试失败或未完成，请查看测试报告"
            $testRunSuccess = $false
        }

        Write-Info "测试结果已保存到: $testResultFile"
        Write-Info "测试期间 logcat 已保存到: $logcatFile"
    } else {
        Write-Warn "无法确定应用包名，跳过 instrumentation 测试"
    }
} else {
    Write-Warn "无测试 APK，跳过 instrumentation 测试"
    # 即使不运行测试，也捕获当前 logcat
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $logcatFile = Join-Path $REPORTS_DIR "logcat_$timestamp.log"
    & $ADB_PATH -s $TARGET_DEVICE logcat -d -v time > $logcatFile 2>&1
    Write-Info "当前设备 logcat 已保存到: $logcatFile"
}

# ============================================
# 步骤 6: 截图
# ============================================

Write-Step "捕获设备截图"

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$screenshotDevicePath = "/sdcard/screenshot_$timestamp.png"
$screenshotLocalPath = Join-Path $REPORTS_DIR "screenshot_$timestamp.png"

Write-Info "在设备上截图..."
& $ADB_PATH -s $TARGET_DEVICE shell screencap -p $screenshotDevicePath
if ($LASTEXITCODE -eq 0) {
    Write-Info "拉取截图到本地..."
    & $ADB_PATH -s $TARGET_DEVICE pull $screenshotDevicePath $screenshotLocalPath
    if ($LASTEXITCODE -eq 0) {
        Write-Success "截图已保存: $screenshotLocalPath"
        # 清理设备上的临时截图
        & $ADB_PATH -s $TARGET_DEVICE shell rm $screenshotDevicePath 2>$null
    } else {
        Write-Warn "截图拉取失败"
    }
} else {
    Write-Warn "截图失败"
}

# ============================================
# 步骤 7: 完成
# ============================================

Write-Step "测试流程完成"

# 列出所有生成的报告文件
Write-Info "生成的报告文件:"
$reportFiles = Get-ChildItem -Path $REPORTS_DIR -File | Sort-Object LastWriteTime -Descending
foreach ($file in $reportFiles) {
    Write-Host "  - $($file.Name) ($([math]::Round($file.Length / 1KB, 2)) KB)" -ForegroundColor Gray
}

Write-Host ""
if ($testRunSuccess) {
    Write-Success "所有操作已完成！"
} else {
    Write-Warn "操作完成，但存在测试失败"
}
Write-Host ""
Write-Host "报告目录: $REPORTS_DIR" -ForegroundColor Cyan
Write-Host ""

exit 0
