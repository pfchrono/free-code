param(
    [Parameter(Mandatory = $false)]
    [string]$Prompt = "Summarize how the copilot adapter handles message translation and mention any token-saving behavior.",

    [Parameter(Mandatory = $false)]
    [string]$OutputDir = (Join-Path $PWD "benchmark-results"),

    [Parameter(Mandatory = $false)]
    [switch]$AllowTools,

    [Parameter(Mandatory = $false)]
    [switch]$StrictPruning,

    [Parameter(Mandatory = $false)]
    [string]$Model = "claude-sonnet-4.6",

    [Parameter(Mandatory = $false)]
    [switch]$NoBare,

    # Set to a small value (e.g. 0.06) to force compaction to fire during a
    # short benchmark session. At 256K context, 0.06 = ~15K token threshold,
    # which is below the ~17K send size and will demonstrate compaction savings.
    [Parameter(Mandatory = $false)]
    [double]$CompactionRatio = 0.8
)

$ErrorActionPreference = "Stop"

function Set-BenchmarkEnv {
    param(
        [string]$DebugFile,
        [bool]$Optimized,
        [bool]$StrictPruningEnabled,
        [double]$CompactionRatioValue = 0.8
    )

    $env:CLAUDE_CODE_USE_COPILOT = "1"
    $env:DEBUG = "1"
    $env:CLAUDE_CODE_DEBUG_LOG_LEVEL = "debug"
    $env:COPILOT_DEDUP_TTL_MS = "15000"

    if ($Optimized) {
        Remove-Item Env:COPILOT_DISABLE_CONTEXT_COMPACTION -ErrorAction Ignore
        Remove-Item Env:COPILOT_DISABLE_REQUEST_DEDUP -ErrorAction Ignore
        $env:COPILOT_CONTEXT_COMPACTION_RATIO = [string]$CompactionRatioValue
        if ($CompactionRatioValue -lt 0.3) {
            $targetTokens = [math]::Floor(256000 * $CompactionRatioValue)
            $env:COPILOT_CONTEXT_COMPACTION_TARGET_TOKENS = [string]$targetTokens
        }
        else {
            Remove-Item Env:COPILOT_CONTEXT_COMPACTION_TARGET_TOKENS -ErrorAction Ignore
        }
        # When using a forced low ratio for benchmarking, also lower the min-messages
        # floor so the compaction loop can actually drop messages.
        if ($CompactionRatioValue -lt 0.5) {
            $env:COPILOT_CONTEXT_MIN_MESSAGES = "2"
        }
        else {
            $env:COPILOT_CONTEXT_MIN_MESSAGES = "24"
        }
        if ($StrictPruningEnabled) {
            $env:COPILOT_STRICT_TOOL_RESULT_PRUNING = "1"
        }
        else {
            Remove-Item Env:COPILOT_STRICT_TOOL_RESULT_PRUNING -ErrorAction Ignore
        }
    }
    else {
        $env:COPILOT_DISABLE_CONTEXT_COMPACTION = "1"
        $env:COPILOT_DISABLE_REQUEST_DEDUP = "1"
        Remove-Item Env:COPILOT_STRICT_TOOL_RESULT_PRUNING -ErrorAction Ignore
        Remove-Item Env:COPILOT_CONTEXT_COMPACTION_RATIO -ErrorAction Ignore
        Remove-Item Env:COPILOT_CONTEXT_COMPACTION_TARGET_TOKENS -ErrorAction Ignore
        Remove-Item Env:COPILOT_CONTEXT_MIN_MESSAGES -ErrorAction Ignore
    }

    $script:CurrentDebugFile = $DebugFile
}

function Clear-BenchmarkEnv {
    @(
        "CLAUDE_CODE_USE_COPILOT",
        "DEBUG",
        "CLAUDE_CODE_DEBUG_LOG_LEVEL",
        "COPILOT_DEDUP_TTL_MS",
        "COPILOT_DISABLE_CONTEXT_COMPACTION",
        "COPILOT_DISABLE_REQUEST_DEDUP",
        "COPILOT_STRICT_TOOL_RESULT_PRUNING",
        "COPILOT_CONTEXT_COMPACTION_RATIO",
        "COPILOT_CONTEXT_COMPACTION_TARGET_TOKENS",
        "COPILOT_CONTEXT_MIN_MESSAGES"
    ) | ForEach-Object {
        Remove-Item "Env:$_" -ErrorAction Ignore
    }
}

function Invoke-OneShotRun {
    param(
        [string]$Label,
        [string]$DebugFile,
        [bool]$Optimized,
        [bool]$StrictPruningEnabled
    )

    Set-BenchmarkEnv -DebugFile $DebugFile -Optimized $Optimized -StrictPruningEnabled $StrictPruningEnabled -CompactionRatioValue $CompactionRatio

    $noToolsInstruction = "Do not use tools. Answer directly without searching, reading files, or running commands."

    $args = @(
        "run", "dev", "--",
        "--print",
        "--output-format", "json",
        "--model", $Model,
        "--debug-file", $DebugFile,
        "--permission-mode", "acceptEdits",
        "--max-turns", "3",
        "--append-system-prompt", $noToolsInstruction,
        $Prompt
    )

    if (-not $NoBare) {
        $args = @("run", "dev", "--", "--bare") + $args[3..($args.Length - 1)]
    }

    if ($AllowTools) {
        $args += @("--tools", "default")
    }

    $stdoutFile = [System.IO.Path]::ChangeExtension($DebugFile, ".stdout.json")
    $stderrFile = [System.IO.Path]::ChangeExtension($DebugFile, ".stderr.log")

    Write-Host "Running $Label benchmark..."
    Push-Location $PWD.Path
    try {
        & bun @args 1> $stdoutFile 2> $stderrFile
        $exitCode = $LASTEXITCODE
        $stdoutText = if (Test-Path $stdoutFile) { Get-Content -Path $stdoutFile -Raw } else { "" }
        $parsedResult = $null
        if (-not [string]::IsNullOrWhiteSpace($stdoutText)) {
            try {
                $parsedResult = $stdoutText | ConvertFrom-Json -ErrorAction Stop
            }
            catch {
                $parsedResult = $null
            }
        }

        $hasUsableResult = $false
        if ($parsedResult -and $parsedResult.type -eq "result") {
            $hasUsableResult = $true
        }

        if ($exitCode -ne 0 -and -not $hasUsableResult) {
            throw "$Label run failed with exit code $LASTEXITCODE. See $stderrFile"
        }
    }
    finally {
        Pop-Location
    }

    return [PSCustomObject]@{
        Label = $Label
        DebugFile = $DebugFile
        StdoutFile = $stdoutFile
        StderrFile = $stderrFile
        ExitCode = $exitCode
    }
}

function Get-LastMatchValue {
    param(
        [string[]]$Lines,
        [string]$Pattern,
        [string]$Key
    )

    $matchLine = $Lines | Select-String -Pattern $Pattern | Select-Object -Last 1
    if (-not $matchLine) {
        return $null
    }

    $regex = [regex]::Match($matchLine.Line, "$Key=(\d+)")
    if (-not $regex.Success) {
        return $null
    }

    return [int]$regex.Groups[1].Value
}

function Get-MinMatchValue {
    param(
        [string[]]$Lines,
        [string]$Pattern,
        [string]$Key
    )

    $values = $Lines | Select-String -Pattern $Pattern | ForEach-Object {
        $m = [regex]::Match($_.Line, "$Key=(\d+)")
        if ($m.Success) { [int]$m.Groups[1].Value }
    } | Where-Object { $_ -ne $null }

    if (-not $values) { return $null }
    return ($values | Measure-Object -Minimum).Minimum
}

function Get-SumMatchValue {
    param(
        [string[]]$Lines,
        [string]$Pattern,
        [string]$Key
    )

    $values = $Lines | Select-String -Pattern $Pattern | ForEach-Object {
        $m = [regex]::Match($_.Line, "$Key=(\d+)")
        if ($m.Success) { [int]$m.Groups[1].Value }
    } | Where-Object { $_ -ne $null }

    if (-not $values) { return $null }
    return ($values | Measure-Object -Sum).Sum
}

function Get-StringMatchesCount {
    param(
        [string[]]$Lines,
        [string]$Pattern
    )

    return @($Lines | Select-String -Pattern $Pattern).Count
}

function Get-BenchmarkSummary {
    param(
        [string]$DebugFile,
        [string]$Label
    )

    $lines = Get-Content -Path $DebugFile -ErrorAction Stop

    $estimatedInputTokens = Get-LastMatchValue -Lines $lines -Pattern "\[copilot-adapter\] request usage" -Key "estimated_input_tokens"
    # Use the MINIMUM request_input_tokens across all turns — this reflects the best-case
    # compacted state and is the most meaningful metric for savings comparison.
    $requestInputTokens = Get-MinMatchValue -Lines $lines -Pattern "\[copilot-adapter\] request usage" -Key "request_input_tokens"
    $requestInputTokensFirst = Get-LastMatchValue -Lines ($lines | Select-String -Pattern "\[copilot-adapter\] request usage" | Select-Object -First 1 | ForEach-Object { $_.Line }) -Pattern "\[copilot-adapter\] request usage" -Key "request_input_tokens"
    $originalMessageCount = Get-LastMatchValue -Lines $lines -Pattern "\[copilot-adapter\] request usage" -Key "original_message_count"
    $requestMessageCount = Get-LastMatchValue -Lines $lines -Pattern "\[copilot-adapter\] request usage" -Key "request_message_count"
    $promptTokens = Get-LastMatchValue -Lines $lines -Pattern "\[copilot-adapter\] response usage" -Key "prompt_tokens"
    $completionTokens = Get-SumMatchValue -Lines $lines -Pattern "\[copilot-adapter\] response usage" -Key "completion_tokens"
    $totalTokens = Get-SumMatchValue -Lines $lines -Pattern "\[copilot-adapter\] response usage" -Key "total_tokens"
    $turnCount = Get-StringMatchesCount -Lines $lines -Pattern "\[copilot-adapter\] response usage"

    [PSCustomObject]@{
        label = $Label
        debug_file = $DebugFile
        estimated_input_tokens = $estimatedInputTokens
        request_input_tokens = $requestInputTokens
        request_input_tokens_first_turn = $requestInputTokensFirst
        original_message_count = $originalMessageCount
        request_message_count = $requestMessageCount
        prompt_tokens = $promptTokens
        completion_tokens_total = $completionTokens
        total_tokens_sum = $totalTokens
        turn_count = $turnCount
        exit_code = $null
        compaction_events = Get-StringMatchesCount -Lines $lines -Pattern "\[copilot-adapter\] compacted request context"
        replay_cache_hits = Get-StringMatchesCount -Lines $lines -Pattern "\[copilot-adapter\] replay cache hit"
        inflight_coalesced = Get-StringMatchesCount -Lines $lines -Pattern "\[copilot-adapter\] coalescing duplicate request"
    }
}

function New-ComparisonSummary {
    param(
        [object]$Baseline,
        [object]$OptimizedSummary,
        [string]$PromptText
    )

    $requestSavings = $null
    if ($Baseline.request_input_tokens -and $OptimizedSummary.request_input_tokens) {
        $requestSavings = $Baseline.request_input_tokens - $OptimizedSummary.request_input_tokens
    }

    $messageSavings = $null
    if ($Baseline.request_message_count -and $OptimizedSummary.request_message_count) {
        $messageSavings = $Baseline.request_message_count - $OptimizedSummary.request_message_count
    }

    return [PSCustomObject]@{
        generated_at = (Get-Date).ToString("o")
        prompt = $PromptText
        baseline = $Baseline
        optimized = $OptimizedSummary
        delta = [PSCustomObject]@{
            request_input_tokens_saved = $requestSavings
            request_message_count_saved = $messageSavings
            baseline_total_tokens_sum = $Baseline.total_tokens_sum
            optimized_total_tokens_sum = $OptimizedSummary.total_tokens_sum
        }
    }
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$baselineDebug = Join-Path $OutputDir "copilot-baseline-$timestamp.debug.log"
$optimizedDebug = Join-Path $OutputDir "copilot-optimized-$timestamp.debug.log"
$summaryJson = Join-Path $OutputDir "copilot-benchmark-summary-$timestamp.json"
$summaryTxt = Join-Path $OutputDir "copilot-benchmark-summary-$timestamp.txt"

try {
    $baselineRun = Invoke-OneShotRun -Label "baseline" -DebugFile $baselineDebug -Optimized $false -StrictPruningEnabled $false
    $optimizedRun = Invoke-OneShotRun -Label "optimized" -DebugFile $optimizedDebug -Optimized $true -StrictPruningEnabled $StrictPruning.IsPresent

    $baselineSummary = Get-BenchmarkSummary -DebugFile $baselineRun.DebugFile -Label "baseline"
    $optimizedSummary = Get-BenchmarkSummary -DebugFile $optimizedRun.DebugFile -Label "optimized"
    $baselineSummary.exit_code = $baselineRun.ExitCode
    $optimizedSummary.exit_code = $optimizedRun.ExitCode
    $comparison = New-ComparisonSummary -Baseline $baselineSummary -OptimizedSummary $optimizedSummary -PromptText $Prompt

    $comparison | ConvertTo-Json -Depth 8 | Set-Content -Path $summaryJson -Encoding UTF8

    @(
        "Copilot token benchmark"
        "Generated: $($comparison.generated_at)"
        "Prompt: $Prompt"
        ""
        "Baseline"
        "  request_input_tokens (min across turns): $($baselineSummary.request_input_tokens)"
        "  request_input_tokens (first turn):        $($baselineSummary.request_input_tokens_first_turn)"
        "  turn_count: $($baselineSummary.turn_count)"
        "  total_tokens_sum (all turns): $($baselineSummary.total_tokens_sum)"
        "  request_message_count: $($baselineSummary.request_message_count)"
        "  exit_code: $($baselineSummary.exit_code)"
        "  debug_file: $($baselineSummary.debug_file)"
        ""
        "Optimized"
        "  request_input_tokens (min across turns): $($optimizedSummary.request_input_tokens)"
        "  request_input_tokens (first turn):        $($optimizedSummary.request_input_tokens_first_turn)"
        "  turn_count: $($optimizedSummary.turn_count)"
        "  total_tokens_sum (all turns): $($optimizedSummary.total_tokens_sum)"
        "  request_message_count: $($optimizedSummary.request_message_count)"
        "  exit_code: $($optimizedSummary.exit_code)"
        "  compaction_events: $($optimizedSummary.compaction_events)"
        "  replay_cache_hits: $($optimizedSummary.replay_cache_hits)"
        "  inflight_coalesced: $($optimizedSummary.inflight_coalesced)"
        "  debug_file: $($optimizedSummary.debug_file)"
        ""
        "Delta (min request_input_tokens baseline − optimized)"
        "  request_input_tokens_saved: $($comparison.delta.request_input_tokens_saved)"
        "  request_message_count_saved: $($comparison.delta.request_message_count_saved)"
        "  baseline_total_tokens_sum: $($comparison.delta.baseline_total_tokens_sum)"
        "  optimized_total_tokens_sum: $($comparison.delta.optimized_total_tokens_sum)"
        ""
        "Note"
        "  replay_cache_hits and inflight_coalesced usually remain 0 in one-shot mode because each benchmark run uses a fresh process."
    ) | Set-Content -Path $summaryTxt -Encoding UTF8

    Write-Host "Benchmark complete."
    Write-Host "Summary JSON: $summaryJson"
    Write-Host "Summary TXT:  $summaryTxt"
    Write-Host "Baseline log: $baselineDebug"
    Write-Host "Optimized log: $optimizedDebug"
}
finally {
    Clear-BenchmarkEnv
}