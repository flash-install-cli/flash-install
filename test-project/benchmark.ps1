# PowerShell Benchmark Script for Flash Install Only

Write-Host "=== Flash Install Benchmark (PowerShell) ==="

function Clean {
    Write-Host "Cleaning up..."
    Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
    Remove-Item -Force .flashpack* -ErrorAction SilentlyContinue
}

function Time-Command($label, $command) {
    Write-Host "\n=== $label ==="
    $duration = Measure-Command { Invoke-Expression $command }
    Write-Host "$label took $($duration.TotalSeconds) seconds."
}

# First run with flash-install
Clean
Time-Command "First Run: flash-install" "node ..\dist\cli.js install"

# Clean up
Clean

# Second run with flash-install
Time-Command "Second Run: flash-install" "node ..\dist\cli.js install"

# Clean up
Clean

# First run with bundled flash-install --fast
Time-Command "First Run: flash-install.bundle.js --fast" "node ..\dist\flash-install.bundle.js --fast"

# Clean up
Clean

# Second run with bundled flash-install --fast
Time-Command "Second Run: flash-install.bundle.js --fast" "node ..\dist\flash-install.bundle.js --fast"

Write-Host "\n=== Benchmark Complete ===" 