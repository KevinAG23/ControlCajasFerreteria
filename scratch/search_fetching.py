with open(r"c:\Users\User\Desktop\KEVIN\Flujo_Cajas\frontend\src\pages\AdminDashboard.jsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if "useEffect" in line or "fetch" in line or "get" in line or ".then" in line:
        # Check if line contains loading data
        if any(w in line.lower() for w in ["load", "fetch", "data", "user", "contact", "caja", "grab", "aten"]):
            print(f"Line {idx+1}: {line.strip()}")
