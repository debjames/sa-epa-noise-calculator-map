#!/bin/bash
cd "$(dirname "$0")"
powershell.exe -ExecutionPolicy Bypass -File "./serve.ps1"
