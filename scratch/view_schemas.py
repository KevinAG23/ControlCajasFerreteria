with open(r"c:\Users\User\Desktop\KEVIN\Flujo_Cajas\backend_admin\schemas.py", "r", encoding="utf-8") as f:
    code = f.read()

# find lines matching Grabacion
lines = code.splitlines()
in_grab = False
for idx, line in enumerate(lines):
    if "class Grabacion" in line:
        in_grab = True
    if in_grab:
        print(f"{idx+1}: {line}")
        if line.strip() == "" and idx > 0 and lines[idx-1].strip() == "":
            pass # keep printing until end of class
        if "class " in line and "class Grabacion" not in line:
            in_grab = False
