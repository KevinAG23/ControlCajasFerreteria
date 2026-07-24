with open(r"c:\Users\User\Desktop\KEVIN\Flujo_Cajas\whisperx_worker\whisperx_worker.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if 'rol' in line or 'inferido' in line or 'speaker' in line:
        print(f"Line {idx+1}: {line.strip()}")
