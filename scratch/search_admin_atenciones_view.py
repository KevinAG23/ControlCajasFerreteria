with open(r"c:\Users\User\Desktop\KEVIN\Flujo_Cajas\frontend\src\pages\AdminDashboard.jsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if 'selectedCashierForAtenciones' in line or 'CashierAtencionesModal' in line:
         # print 5 lines around
         start = max(0, idx - 5)
         end = min(len(lines), idx + 10)
         print(f"--- Line {idx+1} ---")
         for i in range(start, end):
             print(f"{i+1}: {lines[i].strip()}")
