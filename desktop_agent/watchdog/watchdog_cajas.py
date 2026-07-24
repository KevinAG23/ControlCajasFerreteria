"""
watchdog_cajas.py
-----------------
Watchdog para CajaRecorderAgent.
Se ejecuta como tarea del sistema (SYSTEM) cada 30 segundos.
Si el proceso no está corriendo, lo lanza.
El cajero NO puede finalizarlo desde el Administrador de Tareas.
"""

import subprocess
import sys
import os
import time
import logging

# ── Configuración ──────────────────────────────────────────────────────────────
# Nombre del ejecutable (sin ruta) para buscarlo en los procesos activos
PROCESS_NAME = "CajaRecorderAgent.exe"

# Ruta absoluta al ejecutable. Ajusta si lo instalas en otro lugar.
EXE_PATH = r"C:\CajaRecorder\CajaRecorderAgent.exe"

# Intervalo de comprobación en segundos
CHECK_INTERVAL = 30

# Log (opcional, útil para auditoría)
LOG_FILE = r"C:\CajaRecorder\watchdog.log"
# ──────────────────────────────────────────────────────────────────────────────

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format="%(asctime)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


def is_running(name: str) -> bool:
    """Devuelve True si el proceso con ese nombre está activo."""
    try:
        output = subprocess.check_output(
            ["tasklist", "/FI", f"IMAGENAME eq {name}", "/NH"],
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW,
        ).decode(errors="ignore")
        return name.lower() in output.lower()
    except Exception:
        return False


def launch():
    """Lanza el ejecutable de forma visible (con ventana de bandeja)."""
    if not os.path.exists(EXE_PATH):
        logging.error(f"No se encontró el ejecutable: {EXE_PATH}")
        return
    try:
        subprocess.Popen(
            [EXE_PATH],
            creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
        )
        logging.info(f"Proceso iniciado: {EXE_PATH}")
    except Exception as e:
        logging.error(f"Error al iniciar el proceso: {e}")


def main():
    logging.info("Watchdog iniciado.")
    while True:
        if not is_running(PROCESS_NAME):
            logging.warning(f"{PROCESS_NAME} no está corriendo. Reiniciando...")
            launch()
        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    main()
