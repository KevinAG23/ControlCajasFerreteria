with open(r"c:\Users\User\Desktop\KEVIN\Flujo_Cajas\frontend\src\components\dashboard\CashierAtencionesModal.jsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")
# let's search for the rendering loop of atenciones (typically atenciones.map)
for idx, line in enumerate(lines):
    if 'atenciones.map' in line or 'filtered.map' in line or 'render' in line or 'getAtencionesByCajero' in line:
        start = max(0, idx - 5)
        end = min(len(lines), idx + 20)
        print(f"--- Line {idx+1} ---")
        for i in range(start, end):
             print(f"{i+1}: {lines[i].strip()}")
