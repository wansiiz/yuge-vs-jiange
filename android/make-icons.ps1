# 生成 APK 启动图标（金色 VS 圆环风格），输出到各 mipmap 密度目录
Add-Type -AssemblyName System.Drawing

$resDir = 'E:\lvsz\android\app\src\main\res'

# 各密度尺寸
$densities = @{
    'mipmap-mdpi'    = 48
    'mipmap-hdpi'    = 72
    'mipmap-xhdpi'   = 96
    'mipmap-xxhdpi'  = 144
    'mipmap-xxxhdpi' = 192
}

function New-Icon([int]$size, [string]$path) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # 深蓝背景（斜向渐变）
    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(255, 16, 22, 48),
        [System.Drawing.Color]::FromArgb(255, 40, 70, 130),
        45.0)
    $g.FillRectangle($bgBrush, $rect)

    # 青色描边圆环
    $ring = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 34, 211, 238), [float]([Math]::Max(2.0, $size * 0.07)))
    $g.DrawEllipse($ring, $size * 0.10, $size * 0.10, $size * 0.80, $size * 0.80)

    # 中央金色 VS 文字
    $fontSize = [Math]::Max(9.0, $size * 0.32)
    $font = New-Object System.Drawing.Font('Arial', [float]$fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $gold = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 179, 0))
    $g.DrawString('VS', $font, $gold, $rect, $sf)

    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

foreach ($k in $densities.Keys) {
    $dir = Join-Path $resDir $k
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $out = Join-Path $dir 'ic_launcher.png'
    New-Icon $densities[$k] $out
    "生成 $k / ic_launcher.png ($($densities[$k])px)"
}
"DONE"
