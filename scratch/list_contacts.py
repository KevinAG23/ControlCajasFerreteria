import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env")
DB_URL = os.getenv("DATABASE_URL_SYNC", "").strip() or os.getenv("DATABASE_URL", "").strip()
if DB_URL.startswith("postgresql+asyncpg://"):
    DB_URL = DB_URL.replace("postgresql+asyncpg://", "postgresql://", 1)

print(f"Connecting to DB: {DB_URL}")
try:
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("SELECT id, nombre, apellido, rol FROM public.contactos")
    contacts = cur.fetchall()
    print("\n=== TODOS LOS CONTACTOS EN LA BD ===")
    for c in contacts:
         print(f"ID: {c[0]} | Nombre: {c[1]} {c[2]} | Rol: {c[3]}")
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
