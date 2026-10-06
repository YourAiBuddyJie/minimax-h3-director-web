param([string]$ComfyRoot = 'D:\AI\ComfyUI-H3\director_test\ComfyUI')
$ErrorActionPreference = 'Stop'
$bridgeSource = Join-Path $PSScriptRoot '..\integrations\ComfyUI-H3-Director-Web-Bridge\__init__.py'
if (!(Test-Path -LiteralPath (Join-Path $ComfyRoot 'custom_nodes\ComfyUI-MiniMaxH3-Director\director.py'))) { throw 'Thefrizzy1 Director must already be installed in this ComfyUI environment.' }
$bridgeTarget = Join-Path $ComfyRoot 'custom_nodes\ComfyUI-H3-Director-Web-Bridge'
New-Item -ItemType Directory -Force -Path $bridgeTarget | Out-Null
Copy-Item -LiteralPath $bridgeSource -Destination (Join-Path $bridgeTarget '__init__.py') -Force
Write-Output "Installed independent adapter at $bridgeTarget. Restart ComfyUI to load it. Upstream Director is unchanged."
