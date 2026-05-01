#!/usr/bin/env python3
import sys

# Read the file
with open(r"C:\Users\Ethan\Documents\School Work\Sophomore - Spring 2026\CSCI391\vehicle-market-tracker\components\ColorBends.tsx", 'r') as f:
    lines = f.readlines()

# Remove lines 365-368 (indices 364-367 in 0-based)
# Keep lines up to 364, then add the final closing brace
new_lines = lines[:364] + ['}\n']

# Write back
with open(r"C:\Users\Ethan\Documents\School Work\Sophomore - Spring 2026\CSCI391\vehicle-market-tracker\components\ColorBends.tsx", 'w') as f:
    f.writelines(new_lines)

print("Fixed ColorBends.tsx")
