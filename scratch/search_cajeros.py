import re

file_path = r"c:\Users\User\Desktop\KEVIN\Flujo_Cajas\frontend\src\pages\AdminDashboard.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# Let's find functions starting with fetch or load
functions = re.findall(r"const\s+(\w+)\s*=\s*async\s*\(\)\s*=>", code)
print("=== ASYNC FUNCTIONS ===")
for func in functions:
    if any(k in func.lower() for k in ["cajero", "contacto", "grabacion", "atencion", "data", "box", "caja"]):
        print(func)

print("\n=== FETCH CALLS IN CODE ===")
for idx, line in enumerate(code.splitlines()):
    if "api/" in line or "axios" in line or "fetch" in line:
        if any(k in line.lower() for k in ["cajero", "contacto", "grabacion", "atencion", "db"]):
            print(f"Line {idx+1}: {line.strip()}")
