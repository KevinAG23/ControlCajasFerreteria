import os

backend_dir = r"c:\Users\User\Desktop\KEVIN\Flujo_Cajas\app"

def search_files(directory):
    results = []
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.py'):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                    if 'atenciones' in content or 'usuarios' in content:
                        for idx, line in enumerate(content.splitlines()):
                            if '@router.' in line or '/atenciones' in line or '/usuarios' in line:
                                results.append({
                                    'file': filepath,
                                    'line_num': idx + 1,
                                    'content': line.strip()
                                })
                except Exception as e:
                    pass
    return results

if __name__ == "__main__":
    found = search_files(backend_dir)
    print(f"Found {len(found)} references in app:")
    for item in found[:40]:
        rel = os.path.relpath(item['file'], backend_dir)
        print(f"{rel}:{item['line_num']}: {item['content']}")
