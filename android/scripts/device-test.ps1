# Installs the release APK on a connected device or emulator, drives the main
# journeys with adb + uiautomator, and saves screenshots to ../../shots/android2.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/device-test.ps1 [-Apk dist/OpenWallet-2.0.0.apk]
param([string]$Apk = (Join-Path $PSScriptRoot '..\dist\OpenWallet-2.0.0.apk'))
$ErrorActionPreference = 'Continue'
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
$out = Join-Path $PSScriptRoot '..\..\shots\android2'
New-Item -ItemType Directory -Force $out | Out-Null
$pkg = 'org.openwallet.app'
$results = New-Object System.Collections.Generic.List[string]
$script:W = 1080; $script:H = 2400

function Dump {
    & $adb shell uiautomator dump /sdcard/ui.xml 2>$null | Out-Null
    & $adb pull /sdcard/ui.xml "$env:TEMP\ow-ui.xml" 2>$null | Out-Null
    try { [xml](Get-Content "$env:TEMP\ow-ui.xml" -Raw -Encoding UTF8) } catch { $null }
}
function Node($label, $contains = $false) {
    $x = Dump; if (-not $x) { return $null }
    $x.SelectNodes('//node') | Where-Object { if ($contains) { $_.text -like "*$label*" -or $_.'content-desc' -like "*$label*" } else { $_.text -eq $label -or $_.'content-desc' -eq $label } } | Select-Object -First 1
}
function Center($n) { $m = [regex]::Match($n.bounds, '\[(\d+),(\d+)\]\[(\d+),(\d+)\]'); @((([int]$m.Groups[1].Value + [int]$m.Groups[3].Value) / 2), (([int]$m.Groups[2].Value + [int]$m.Groups[4].Value) / 2)) }
function Find($label, $tries = 6, $scroll = $true, $contains = $false) {
    for ($i = 0; $i -lt $tries; $i++) {
        $n = Node $label $contains; if ($n) { return $n }
        if ($scroll) { & $adb shell input swipe ($W / 2) ($H * 0.7) ($W / 2) ($H * 0.35) 300 } else { Start-Sleep -Milliseconds 700 }
        Start-Sleep -Milliseconds 500
    }
    $null
}
function Tap($label, $wait = 1200, $scroll = $true, $contains = $false) {
    $n = Find $label 6 $scroll $contains
    if (-not $n) { $results.Add("MISSING  $label"); return $false }
    $c = Center $n; & $adb shell input tap $c[0] $c[1]; Start-Sleep -Milliseconds $wait; $true
}
function Has($label, $contains = $false) { $null -ne (Find $label 3 $false $contains) }
function Check($name, $ok) { $results.Add(("{0}  {1}" -f ($(if ($ok) { 'PASS   ' } else { 'FAIL   ' }), $name))) }
function Shot($name) { & $adb shell screencap -p /sdcard/s.png; & $adb pull /sdcard/s.png (Join-Path $out "$name.png") 2>$null | Out-Null }
function Back { & $adb shell input keyevent 4; Start-Sleep -Milliseconds 900 }
function Top { for ($k = 0; $k -lt 5; $k++) { & $adb shell input swipe ($W / 2) ($H * 0.3) ($W / 2) ($H * 0.95) 150 }; Start-Sleep 1 }
function TypeText($t) { & $adb shell input text ($t -replace ' ', '%s'); Start-Sleep -Milliseconds 400 }

$size = (& $adb shell wm size) -replace '.*: ', ''; if ($size -match '(\d+)x(\d+)') { $script:W = [int]$Matches[1]; $script:H = [int]$Matches[2] }
& $adb shell locksettings set-pin 1234 2>$null | Out-Null
& $adb uninstall $pkg 2>$null | Out-Null
$inst = & $adb install -r $Apk 2>&1 | Out-String
Check 'APK installs' ($inst -match 'Success')
& $adb logcat -c
& $adb shell am start -n "$pkg/.MainActivity" | Out-Null
Start-Sleep 5
Check 'Welcome dialog on first launch' (Has 'Welcome to Open Wallet')
Shot '01-welcome'
Tap 'Got it' 1000 $false | Out-Null
Check 'Empty wallet on first launch (no sample data)' (Has 'Your passes show up here')
Shot '02-home-empty'
Tap 'Try it with sample passes' 2500 | Out-Null
& $adb shell input swipe ($W / 2) ($H * 0.3) ($W / 2) ($H * 0.9) 300; Start-Sleep 1
Check 'Sample cards shown' (Has 'Emirates NBD')
Shot '03-home'

$tickets = @(
    @('DEL', 'flight'), @('Sample Film', 'movie'), @('New Delhi', 'train'), @('Lucknow', 'bus'), @('Home', 'taxi'),
    @('Marina', 'ship'), @('Sample theme park', 'amusement'), @('Sample monument', 'entry'), @('Yes Bank', 'loyalty'), @('PVR INOX', 'gift')
)
$i = 4
foreach ($t in $tickets) {
    & $adb shell input swipe ($W / 2) ($H * 0.3) ($W / 2) ($H * 0.95) 200; Start-Sleep 1
    $ok = Tap $t[0] 2200 $true $true
    if ($ok) {
        $ill = Has 'illustration' $true
        Check ("Ticket opens: {0}{1}" -f $t[1], $(if ($t[1] -in @('loyalty', 'gift')) { '' } else { ' (illustration shown: ' + $ill + ')' })) ($ok)
        Shot ("{0:D2}-ticket-{1}" -f $i, $t[1]); $i++
        Back
    }
}

# Add to Wallet flows
Top
Tap 'Add to Wallet' 1500 $false | Out-Null
Check 'Add to Wallet chooser' (Has 'Loyalty card')
Shot '20-add'
Tap 'Gift card' 1500 $false | Out-Null
Check 'Gift card directory' (Has 'PVR INOX Gift Card (India)')
Shot '21-gift-directory'
Back
Tap 'Transport pass' 1500 | Out-Null
Check 'Transport operators' (Has 'Choose a transport operator')
Shot '22-transport'
Back
Tap 'Tickets & events' 1500 | Out-Null
Tap 'Movie ticket' 1500 $false | Out-Null
Tap 'PVR INOX' 1800 | Out-Null
Check 'Movie form with provider' (Has 'Add movie ticket')
Shot '23-movie-form'
Back; Back; Back; Top

# Vault with device credential
Tap 'IDs & personal info' 1500 | Out-Null
Shot '24-ids'
Back; Back; Top
& $adb shell input swipe ($W / 2) ($H * 0.8) ($W / 2) ($H * 0.2) 300; Start-Sleep 1
Tap 'Identity & documents' 1800 | Out-Null
Tap 'Unlock' 2000 $false | Out-Null
TypeText '1234'; & $adb shell input keyevent 66; Start-Sleep 2
Check 'Vault unlocks with screen lock' (Has 'Add document')
Tap 'Add document' 1500 $false | Out-Null
Tap 'National ID card' 1500 | Out-Null
$f = Find 'Name on the document' 2 $false; if ($f) { $c = Center $f; & $adb shell input tap $c[0] $c[1]; TypeText 'Test Person' }
$f = Find 'ID number' 2 $false; if ($f) { $c = Center $f; & $adb shell input tap $c[0] $c[1]; TypeText 'AB1234566789' }
& $adb shell input keyevent 4; Start-Sleep 1
Tap 'Save' 3500 $false | Out-Null; Back
Check 'Document saved and masked' (Has 'XXXX XXXX 6789' $true)
Shot '25-vault'
Back; Back

# Calendar connect (real Google authorization; needs the OAuth client set-up)
& $adb shell input swipe ($W / 2) ($H * 0.3) ($W / 2) ($H * 0.95) 200; Start-Sleep 1
Tap 'Settings' 1500 $false | Out-Null
Tap 'Google Calendar' 1500 | Out-Null
Shot '26-calendar'
Tap 'Connect Google Calendar' 6000 $false | Out-Null
Shot '27-calendar-connect-result'
Check 'Calendar connect reached Google (screen or setup error shown)' ((Has 'developer error' $true) -or (Has 'OAuth' $true) -or (Has 'Choose an account' $true) -or (Has 'Google' $true))

# Crash check
$crash = & $adb logcat -d -b crash 2>$null | Out-String
Check 'No crashes' (-not ($crash -match $pkg))
$results | ForEach-Object { $_ }
$results | Set-Content (Join-Path $out 'results.txt') -Encoding utf8
