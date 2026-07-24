import os

api_dir = r"c:\Users\User\Desktop\KEVIN\Flujo_Cajas\frontend\src\api"

for file in os.listdir(api_dir):
    if file.endswith('.js'):
        filepath = os.path.join(api_dir, file)
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        print(f"=== {file} ===")
        for line in content.splitlines():
            if 'const API_URL' in line or 'const NEW_API_URL' in line or 'const BASE_URL' in line or 'localhost' in line:
                print(f"  {line.strip()}")
