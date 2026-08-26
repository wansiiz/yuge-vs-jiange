# ============================================================
# YuGe vs JianGe - APK build script (pure command line, no Gradle)
# Pipeline: copy game files -> aapt2 compile/link -> javac -> d8
#           -> package dex+assets -> zipalign -> sign
# NOTE: ASCII-only to avoid codepage issues with Windows PowerShell 5.1
# Usage: powershell.exe -NoProfile -ExecutionPolicy Bypass -File build.ps1
# ============================================================
$ErrorActionPreference = 'Stop'

$root     = 'E:\lvsz\android'
$gameDir  = 'E:\lvsz'
$tc       = "$root\toolchain"
$jdk      = "$tc\jdk"
$sdk      = "$tc\sdk"
$bt       = "$sdk\build-tools\34.0.0"
$java     = "$jdk\bin\java.exe"
$javac    = "$jdk\bin\javac.exe"
$keytool  = "$jdk\bin\keytool.exe"
$d8       = "$bt\d8.bat"
$aapt2    = "$bt\aapt2.exe"
$zipalign = "$bt\zipalign.exe"
$apksigner= "$bt\apksigner.bat"
$androidJar = "$sdk\platforms\android-34\android.jar"
$srcMain  = "$root\app\src\main"
$build    = "$root\build"
$outApk   = "$root\YuGeJiange.apk"

# d8.bat / apksigner.bat need JAVA_HOME
$env:JAVA_HOME = $jdk
$env:ANDROID_HOME = $sdk

New-Item -ItemType Directory -Force -Path $build | Out-Null

# ---- 0. copy game files into assets (explicit whitelist, keeps APK lean) ----
New-Item -ItemType Directory -Force -Path "$srcMain\assets" | Out-Null
$gameFiles = @(
    'index.html','style.css','script.js',
    'l.jpg','j.jpg','p.jpg','kkk.png','1787738616076.jpg','wansi.jpg',
    'atomic_bomb.mp3','blackout3.mp3','endless_farts.mp3','funny.mp3',
    'heartbeats.mp3','poka02.mp3','powerdown01.mp3','powerup01.mp3','running1.mp3'
)
foreach ($f in $gameFiles) {
    $src = Join-Path $gameDir $f
    if (Test-Path $src) { Copy-Item $src -Destination "$srcMain\assets" -Force }
}
Write-Host "[1/7] assets: $((Get-ChildItem "$srcMain\assets" -File).Count) files"

# ---- 1. aapt2 compile resources ----
$resZip = "$build\res.zip"
if (Test-Path $resZip) { Remove-Item $resZip }
& $aapt2 compile --dir "$srcMain\res" -o $resZip
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile FAILED" }
Write-Host "[2/7] resources compiled"

# ---- 2. aapt2 link (base.apk + R.java) ----
$baseApk = "$build\base.apk"
if (Test-Path $baseApk) { Remove-Item $baseApk }
if (Test-Path "$build\gen") { Remove-Item "$build\gen" -Recurse }
& $aapt2 link -o $baseApk -I $androidJar `
    --manifest "$srcMain\AndroidManifest.xml" `
    --java "$build\gen" `
    --auto-add-overlay $resZip
if ($LASTEXITCODE -ne 0) { throw "aapt2 link FAILED" }
Write-Host "[3/7] resources linked"

# ---- 3. javac compile ----
if (Test-Path "$build\classes") { Remove-Item "$build\classes" -Recurse }
New-Item -ItemType Directory -Force -Path "$build\classes" | Out-Null
$srcs = @(
    "$build\gen\com\yuge\jiange\battle\R.java",
    "$srcMain\java\com\yuge\jiange\battle\MainActivity.java"
)
& $javac -encoding UTF-8 -source 8 -target 8 -bootclasspath $androidJar -d "$build\classes" $srcs
if ($LASTEXITCODE -ne 0) { throw "javac FAILED" }
Write-Host "[4/7] java compiled"

# ---- 4. d8 -> dex ----
if (Test-Path "$build\dex") { Remove-Item "$build\dex" -Recurse }
New-Item -ItemType Directory -Force -Path "$build\dex" | Out-Null
$classFiles = Get-ChildItem "$build\classes" -Recurse -Filter *.class | ForEach-Object { $_.FullName }
& $d8 --lib $androidJar --release --min-api 21 --output "$build\dex" $classFiles
if ($LASTEXITCODE -ne 0) { throw "d8 FAILED" }
Write-Host "[5/7] dex generated"

# ---- 5. inject classes.dex + assets into APK ----
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Add-ZipEntry($zipPath, $entryName, $filePath) {
    $zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Update)
    $entry = $zip.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
    $in = [System.IO.File]::OpenRead($filePath)
    $out = $entry.Open()
    $in.CopyTo($out)
    $out.Dispose(); $in.Dispose(); $zip.Dispose()
}
Add-ZipEntry $baseApk "classes.dex" "$build\dex\classes.dex"
Get-ChildItem "$srcMain\assets" -File | ForEach-Object {
    Add-ZipEntry $baseApk ("assets/" + $_.Name) $_.FullName
}
Write-Host "[6/7] dex + assets packaged"

# ---- 6. zipalign ----
$aligned = "$build\aligned.apk"
if (Test-Path $aligned) { Remove-Item $aligned }
& $zipalign -f 4 $baseApk $aligned
if ($LASTEXITCODE -ne 0) { throw "zipalign FAILED" }

# ---- 7. sign ----
$ks = "$root\debug.keystore"
if (-not (Test-Path $ks)) {
    # redirect stderr to file: avoids NativeCommandError abort under ErrorActionPreference=Stop
    & $keytool -genkeypair -v -keystore $ks -alias androiddebugkey `
        -keyalg RSA -keysize 2048 -validity 10000 `
        -storepass android -keypass android `
        -dname "CN=Android Debug,O=Android,C=US" 2> "$build\keytool.log"
}
& $apksigner sign --ks $ks --ks-pass pass:android --ks-key-alias androiddebugkey --out $outApk $aligned 2> "$build\apksigner.log"
if ($LASTEXITCODE -ne 0) { throw "apksigner FAILED" }
Write-Host "[7/7] signed"

Write-Host "=== verify signature ==="
& $apksigner verify $outApk
if ($LASTEXITCODE -eq 0) { Write-Host "signature OK" }
Get-Item $outApk | Select-Object FullName, @{N='SizeMB';E={[math]::Round($_.Length/1MB,2)}}
Write-Host "=== BUILD DONE ==="
