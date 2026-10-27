# 用法：
#   1. 在仓库根目录建 sub.url 文件，内容为一行订阅地址（此文件已被 .gitignore 排除）
#   2. 运行本脚本：自动把订阅填进 mihomo.yaml 副本 mihomo.local.yaml 并启动 mihomo
#   mihomo.local.yaml 和 sub.url 都只存在于本地，不会进仓库
$root = Split-Path $PSScriptRoot -Parent
$subFile = Join-Path $root 'sub.url'
$tmpl = Join-Path $root 'mihomo.yaml'
$out = Join-Path $root 'mihomo.local.yaml'

if (-not (Test-Path $subFile)) {
    Write-Error "请先创建 sub.url（一行订阅地址）"
    exit 1
}
$sub = (Get-Content $subFile -Raw).Trim()
$conf = (Get-Content $tmpl -Raw -Encoding UTF8).Replace('https://你的订阅地址', $sub)
if ($conf -eq (Get-Content $tmpl -Raw -Encoding UTF8)) {
    Write-Warning "订阅未写入，检查 sub.url 内容是否有效"
}
[IO.File]::WriteAllText($out, $conf, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "已生成 $out"
& mihomo -d $root -f $out @args
