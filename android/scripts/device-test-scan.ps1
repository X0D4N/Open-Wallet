# Device test for 2.1.0: camera scanner, image recognition (synthetic test card), Payments & NFC status.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/device-test-scan.ps1 [-Apk dist/OpenWallet-2.1.0-x86_64-emulator.apk]
param([string]$Apk = (Join-Path $PSScriptRoot '..\dist\OpenWallet-2.1.0-x86_64-emulator.apk'))
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
$out = Join-Path $PSScriptRoot '..\..\shots\android3'; New-Item -ItemType Directory -Force $out | Out-Null
$pkg = 'org.openwallet.app'; $res = New-Object System.Collections.Generic.List[string]
function Dump { & $adb shell uiautomator dump /sdcard/ui.xml 2>$null | Out-Null; & $adb pull /sdcard/ui.xml "$env:TEMP\ow-ui.xml" 2>$null | Out-Null; try { [xml](Get-Content "$env:TEMP\ow-ui.xml" -Raw -Encoding UTF8) } catch { $null } }
function Node($l, $c = $true) { $x = Dump; if (!$x) { return $null }; $x.SelectNodes('//node') | ? { if ($c) { $_.text -like "*$l*" -or $_.'content-desc' -like "*$l*" } else { $_.text -eq $l -or $_.'content-desc' -eq $l } } | Select -First 1 }
function Find($l, $n = 6, $scroll = $true) { for ($i = 0; $i -lt $n; $i++) { $x = Node $l; if ($x) { return $x }; if ($scroll) { & $adb shell input swipe 540 1700 540 800 300 }; Start-Sleep -Milliseconds 700 }; $null }
function Tap($l, $wait = 1500, $scroll = $true) { $n = Find $l 6 $scroll; if (!$n) { $res.Add("MISSING  $l"); return $false }; $m = [regex]::Match($n.bounds, '\[(\d+),(\d+)\]\[(\d+),(\d+)\]'); & $adb shell input tap ((([int]$m.Groups[1].Value) + ([int]$m.Groups[3].Value)) / 2) ((([int]$m.Groups[2].Value) + ([int]$m.Groups[4].Value)) / 2); Start-Sleep -Milliseconds $wait; $true }
function Has($l) { $null -ne (Find $l 3 $false) }
function Check($n, $ok) { $res.Add(("{0}  {1}" -f $(if ($ok) { 'PASS   ' } else { 'FAIL   ' }), $n)) }
function Shot($n) { & $adb shell screencap -p /sdcard/s.png; & $adb pull /sdcard/s.png (Join-Path $out "$n.png") 2>$null | Out-Null }

& $adb uninstall $pkg 2>$null | Out-Null
Check 'APK installs' ((& $adb install -r $Apk 2>&1 | Out-String) -match 'Success')
& $adb shell pm grant $pkg android.permission.CAMERA
& $adb push (Join-Path $PSScriptRoot 'testdata\synthetic-test-card.png') /sdcard/Download/synthetic-test-card.png | Out-Null
& $adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/synthetic-test-card.png | Out-Null
& $adb logcat -c
& $adb shell am start -n "$pkg/.MainActivity" | Out-Null; Start-Sleep 5
Tap 'Got it' 1000 $false | Out-Null
Tap 'Add to Wallet' 1500 $false | Out-Null
Check 'Add to Wallet offers camera scan first' (Has 'Scan a card with the camera')
Shot '01-add'
Tap 'Scan a card with the camera' 4000 $false | Out-Null
Check 'Camera scanner opens with guidance' (Has 'Scan the front of the card')
Shot '02-scanner'
Tap 'Take photo' 5000 $false | Out-Null
Check 'Review screen after capture' (Has 'Check the photo')
Shot '03-review'
Tap 'Use this photo' 7000 $false | Out-Null
Shot '04-after-scan'
Check 'Scan routed to a form or chooser' ((Has 'What is it?') -or (Has 'Add') -or (Has 'payment card'))
& $adb shell input keyevent 4; Start-Sleep 1; & $adb shell input keyevent 4; Start-Sleep 1

# Image import -> on-device OCR -> payment card form
Tap 'Add to Wallet' 1500 $false | Out-Null
Tap 'Choose an image or screenshot' 3500 $false | Out-Null
$picked = Tap 'synthetic-test-card' 9000 $false
if (-not $picked) { Tap 'Downloads' 2000 $false | Out-Null; $picked = Tap 'synthetic-test-card' 9000 $false }
Shot '05-card-from-image'
Check 'Test card image recognised as a payment card' (Has 'Add payment card')
Check 'Bank read from image: HDFC Bank' (Has 'HDFC Bank')
Check 'Last 4 digits read (1111)' (Has '1111')
Check 'Full card number not shown anywhere' (-not (Has '4111 1111 1111 1111'))
& $adb shell input keyevent 4; Start-Sleep 1

# Payments & NFC
& $adb shell am force-stop $pkg; & $adb shell am start -n "$pkg/.MainActivity" | Out-Null; Start-Sleep 4
Tap 'Settings' 1500 $false | Out-Null
Tap 'NFC status, contactless' 2000 | Out-Null
Check 'NFC hardware status shown' (Has 'NFC hardware')
Check 'Payments shown as not available (no partner)' (Has 'Not yet available')
Shot '06-payments-nfc'
$crash = & $adb logcat -d -b crash 2>$null | Out-String
Check 'No crashes' (-not ($crash -match $pkg))
$res | % { $_ }; $res | Set-Content (Join-Path $out 'results.txt') -Encoding utf8
