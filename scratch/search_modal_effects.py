with open(r"c:\Users\User\Desktop\KEVIN\Flujo_Cajas\frontend\src\components\dashboard\CashierAtencionesModal.jsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if "useEffect" in line or "getAtencionesByCajero" in line:
         # print 10 lines around
         start = max(0, idx - 5)
         end = min(len(lines), idx + 25)
         print(f"--- Line {idx+1} ---")
         for i in range(start, end):
             print(f"{i+1}: {lines[i].strip()}")
