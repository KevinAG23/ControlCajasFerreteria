import os

admin_dir = r"c:\Users\User\Desktop\KEVIN\Flujo_Cajas\backend_admin"

def search_files(directory):
    results = []
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.py'):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                    for idx, line in enumerate(lines):
                        if 'grabaciones' in line or 'fecha_hora_inicio' in line:
                            results.append({
                                'file': filepath,
                                'line_num': idx + 1,
                                'content': line.strip()
                            })
                except Exception as e:
                    pass
    return results

if __name__ == "__main__":
    found = search_files(admin_dir)
    print(f"Found {len(found)} references:")
    for item in found:
        rel = os.path.relpath(item['file'], admin_dir)
        print(f"{rel}:{item['line_num']}: {item['content']}")
