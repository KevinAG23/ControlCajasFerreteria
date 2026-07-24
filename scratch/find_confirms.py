import os

frontend_dir = r"c:\Users\User\Desktop\KEVIN\Flujo_Cajas\frontend\src"

def search_files(directory):
    results = []
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(('.js', '.jsx', '.ts', '.tsx', '.html')):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                    for idx, line in enumerate(lines):
                        if 'confirm(' in line or 'alert(' in line or 'window.confirm' in line or 'window.alert' in line:
                            results.append({
                                'file': filepath,
                                'line_num': idx + 1,
                                'content': line.strip()
                            })
                except Exception as e:
                    print(f"Error reading {filepath}: {e}")
    return results

if __name__ == "__main__":
    found = search_files(frontend_dir)
    print(f"Found {len(found)} references:")
    for item in found:
        # relative path
        rel = os.path.relpath(item['file'], frontend_dir)
        print(f"File: {rel} | Line {item['line_num']} | Content: {item['content']}")
