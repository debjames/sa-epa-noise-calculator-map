$nodePath = 'C:\Users\DebJames\node\node-v22.16.0-win-x64'
$env:PATH = $nodePath + ';' + $env:PATH
Set-Location 'C:\Users\DebJames\Documents\Claude\sa-epa-noise-calculator-map'
& node --version
& npm test
