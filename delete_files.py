import os

files_to_delete = [
    'components/ColorBends2.tsx',
    'components/ColorBends.tsx.tmp',
    'fix-colorbends.py'
]

for file_path in files_to_delete:
    if os.path.exists(file_path):
        os.remove(file_path)
        print(f"Deleted: {file_path}")
    else:
        print(f"File not found: {file_path}")

print("Deletion complete")
