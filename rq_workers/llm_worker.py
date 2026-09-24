# rq_workers/llm_worker.py
import os
import json
import time
from typing import Dict, Any
from datetime import datetime, timezone

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# =========================
# ENV
# =========================
load_dotenv()

DATABASE_URL = (os.getenv("DATABASE_URL_SYNC") or "").strip() or (os.getenv("DATABASE_URL") or "").strip()
LLM_PROVIDER = (os.getenv("LLM_PROVIDER") or "groq").strip().lower()
LLM_MODEL = (os.getenv("LLM_MODEL") or "llama-3.3-70b-versatile").strip()
LLM_TIMEOUT_SEC = int(os.getenv("LLM_TIMEOUT_SEC") or "300")
if LLM_TIMEOUT_SEC < 300:
    LLM_TIMEOUT_SEC = 300

GROQ_API_KEY_1 = (os.getenv("GROQ_API_KEY_1") or os.getenv("GROQ_API_KEY") or "").strip()
GROQ_API_KEY_2 = (os.getenv("GROQ_API_KEY_2") or "").strip()
OPENAI_API_KEY = (os.getenv("OPENAI_API_KEY") or "").strip()
if not DATABASE_URL:
    raise RuntimeError("Falta DATABASE_URL_SYNC (recomendado) o DATABASE_URL en .env")

if DATABASE_URL.startswith("postgresql+asyncpg://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)

# =========================
# DB
# =========================
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=1800, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

def log_llm_cost(provider_key: str, input_chars: int, payload: Dict[str, Any]):
    try:
        costos_file = "/app/storage/costos.jsonl"
        estimated_tokens = int(input_chars / 3.5)
        # Cost: Groq is free, OpenAI is $0.15 / 1M input tokens
        cost_per_million = 0.15 if "OPENAI" in provider_key.upper() else 0.0
        costo_dolares = (estimated_tokens / 1000000.0) * cost_per_million
        
        # Try to extract an ID for context
        ref_id = payload.get("grabacion_id") or payload.get("atencion_id") or "desconocido"
        
        record = {
            "fecha": utcnow().isoformat(),
            "referencia_id": str(ref_id),
            "proveedor": provider_key,
            "caracteres": input_chars,
            "tokens_estimados": estimated_tokens,
            "costo_usd": costo_dolares
        }
        os.makedirs(os.path.dirname(costos_file), exist_ok=True)
        with open(costos_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
    except Exception as e:
        print(f"[LLM Worker] Error logueando costo: {e}")


# =========================
# JSON helpers
# =========================
def _strip_code_fences(s: str) -> str:
    s = (s or "").strip()
    if s.startswith("```"):
        s = s.strip().strip("`").strip()
        if s.lower().startswith("json"):
            s = s[4:].lstrip()
    return s

def _extract_first_json_object(s: str) -> str:
    s = (s or "").strip()
    start = s.find("{")
    if start == -1:
        return s
    depth = 0
    for i in range(start, len(s)):
        ch = s[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return s[start:i+1]
    return s

def _parse_json_strict(content: str) -> Dict[str, Any]:
    content = _strip_code_fences(content)
    candidate = _extract_first_json_object(content)
    try:
        return json.loads(candidate)
    except Exception as e:
        raise RuntimeError(f"LLM devolvió algo no-JSON válido. Muestra: {candidate[:400]}") from e

# =========================
# LLM
# =========================
def call_llm(payload: Dict[str, Any], preguntas: list) -> Dict[str, Any]:
    """
    Devuelve JSON:
      - resumen_ejecutivo
      - sentimiento_general: POSITIVO|NEUTRO|NEGATIVO
      - actitudes: string con las actitudes detectadas
      - evaluaciones: lista de {pregunta_id, cumple, justificacion_ia}
    """

    system = (
        "Eres un analista experto en calidad de servicio al cliente. "
        "Tu tarea es evaluar la transcripción de manera integral, comprendiendo el contexto, la intención y las variaciones naturales del lenguaje hablado. "
        "NO es estrictamente necesario que el cajero use las palabras exactas, siempre y cuando el significado o la intención de la métrica se cumpla (por ejemplo, saludar, despedirse, etc.). "
        "Sé justo y permisivo si el cumplimiento es evidente en el contexto de la conversación real. "
        "Devuelve SIEMPRE JSON estricto, sin texto extra."
    )

    lista_preguntas_str = "\n".join([
        f"- ID: {p['id']} | Pregunta: {p['texto_pregunta']}" + 
        (f" | Criterio: {p['instruccion_ia']}" if p.get('instruccion_ia') and p['instruccion_ia'] != "Evalúa si se cumple o no la condición. Responde únicamente con 'true' (Sí) o 'false' (No)." else "") +
        (f" | EJEMPLO RESPUESTA ESPERADA: {p['ejemplo_respuesta_esperada']}" if p.get('ejemplo_respuesta_esperada') else "") +
        (f" | CONFIG RESPUESTA: {p['configuracion_respuesta']}" if p.get('configuracion_respuesta') and p['configuracion_respuesta'] != "{}" else "")
        for p in preguntas
    ])

    compact_format = (
        "{\n"
        '  "resumen_ejecutivo": "Breve resumen fáctico de la interacción (máx. 2 frases).",\n'
        '  "sentimiento_general": "POSITIVO" | "NEUTRO" | "NEGATIVO",\n'
        '  "calificacion_general": 0 a 100,\n'
        '  "actitudes": "Actitud detectada basada en las palabras usadas (máx. 1 frase).",\n'
        '  "evaluaciones": [\n'
        '    {\n'
        '      "pregunta_id": "ID de la pregunta",\n'
        '      "cumple": true | false,\n'
        '      "justificacion_ia": "Cita textual exacta (máx. 10 palabras) o \'No se evidencia en la transcripción\'." \n'
        '    }\n'
        '  ]\n'
        "}"
    )

    user = (
        "Evalúa el cumplimiento de las métricas en la siguiente transcripción.\n"
        "REGLAS DE AUDITORÍA FLEXIBLE:\n"
        "1. COMPRENSIÓN DEL CONTEXTO: Basa tu respuesta en el texto y su contexto natural. Las conversaciones reales son informales; acepta sinónimos, expresiones coloquiales o intenciones claras.\n"
        "2. EXHAUSTIVIDAD: Debes incluir OBLIGATORIAMENTE una evaluación para cada una de las preguntas de la lista. El número de evaluaciones debe ser EXACTO al de preguntas.\n"
        "3. PERMISIVO Y RAZONABLE: Para cada pregunta, evalúa según el 'Criterio', pero con flexibilidad. Si el cajero cumplió el propósito de la regla, evalúalo como 'true'.\n"
        "4. IDENTIFICACIÓN DEL CAJERO: Las métricas aplican a las intervenciones del cajero. Usa el sentido común para diferenciar al cajero del cliente.\n"
        "5. BOOLEANO: 'cumple': true si se cumple la intención o acción; false solo si hubo una omisión clara o fallo evidente.\n"
        "6. JUSTIFICACIÓN: En 'justificacion_ia' provee una breve explicación o cita que demuestre el cumplimiento. Si 'cumple' es false, escribe 'No se evidenció la acción'.\n"
        "7. 'calificacion_general': Porcentaje de cumplimiento de 0 a 100 ((cantidad de cumple=true / total evaluaciones) * 100).\n\n"
        f"PREGUNTAS A EVALUAR:\n{lista_preguntas_str}\n\n"
        f"FORMATO JSON REQUERIDO:\n{compact_format}\n\n"
        f"TRANSCRIPCIÓN (INPUT):\n{json.dumps(payload, ensure_ascii=False)}"
    )

    input_chars = len(system) + len(user)
    estimated_tokens = int(input_chars / 3.5)
    
    fallbacks = []
    if LLM_PROVIDER == "openai" and OPENAI_API_KEY:
        fallbacks.append(("openai", OPENAI_API_KEY, "OPENAI_PRINCIPAL"))
        if GROQ_API_KEY_1: fallbacks.append(("groq", GROQ_API_KEY_1, "GROQ_FALLBACK_1"))
        if GROQ_API_KEY_2: fallbacks.append(("groq", GROQ_API_KEY_2, "GROQ_FALLBACK_2"))
    else:
        if GROQ_API_KEY_1: fallbacks.append(("groq", GROQ_API_KEY_1, "LLAVE 1"))
        if GROQ_API_KEY_2: fallbacks.append(("groq", GROQ_API_KEY_2, "LLAVE 2"))
        if OPENAI_API_KEY: fallbacks.append(("openai", OPENAI_API_KEY, "OPENAI SALVAVIDAS"))
    
    if not fallbacks:
        raise RuntimeError("No hay ninguna llave configurada (ni Groq ni OpenAI).")

    last_error = None
    for provider, api_key, key_name in fallbacks:
        try:
            if provider == "groq":
                from groq import Groq
                client = Groq(api_key=api_key, max_retries=0)
                env_model = os.getenv("LLM_MODEL") or ""
                groq_model = env_model if "llama" in env_model.lower() or "mixtral" in env_model.lower() or "gemma" in env_model.lower() else "llama-3.3-70b-versatile"
                print(f"[LLM Call] Intentando GROQ ({key_name}) con modelo {groq_model} | Caracteres: {input_chars} | Tokens: ~{estimated_tokens}")
                resp = client.chat.completions.create(
                    model=groq_model,
                    messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                    temperature=0.2,
                )
                log_llm_cost(f"GROQ_{key_name}", input_chars, payload)
                return _parse_json_strict((resp.choices[0].message.content or "").strip())
                
            elif provider == "openai":
                from openai import OpenAI
                client = OpenAI(api_key=api_key, max_retries=0)
                openai_model = os.getenv("LLM_MODEL") or "gpt-4o-mini"
                print(f"[LLM Call] Intentando OPENAI ({key_name}) con modelo {openai_model} | Caracteres: {input_chars} | Tokens: ~{estimated_tokens}")
                resp = client.chat.completions.create(
                    model=openai_model,
                    messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                    temperature=0.2,
                    timeout=LLM_TIMEOUT_SEC,
                    response_format={"type": "json_object"},
                )
                log_llm_cost(f"OPENAI_{key_name}", input_chars, payload)
                return _parse_json_strict((resp.choices[0].message.content or "").strip())
        except Exception as e:
            last_error = f"{type(e).__name__}: {str(e)}"
            print(f"[LLM Call] Falló {provider} ({key_name}): {last_error}. Pasando al siguiente proveedor...")
            time.sleep(1)
            
    raise RuntimeError(f"Todos los proveedores de LLM fallaron. Último error: {last_error}")

def call_llm_extract(payload: Dict[str, Any]) -> Dict[str, Any]:
    system = (
        "Eres un analizador de conversaciones de servicio al cliente. "
        "Devuelve SIEMPRE JSON estricto, sin texto extra."
    )

    compact_format = (
        "{\n"
        '  "cajero_speaker": "Identificador exacto de la persona que actúa como Cajero/Agente en la transcripción (ej: \'SPEAKER_00\' o \'SPEAKER_01\').",\n'
        '  "resumen_general": "Resumen ejecutivo de toda la grabación de 20 minutos (máx. 2 frases).",\n'
        '  "sentimiento_general": "POSITIVO" | "NEUTRO" | "NEGATIVO",\n'
        '  "atenciones": [\n'
        '    {\n'
        '      "estado": "COMPLETADA" | "EN_PROCESO",\n'
        '      "inicio_segmento": número (ej: 1),\n'
        '      "fin_segmento": número (ej: 42)\n'
        '    }\n'
        '  ]\n'
        "}"
    )

    cajero_nombre = payload.get("cajero_nombre")
    user = (
        "Analiza la transcripción de audio del cajero (duración aprox. 20 minutos) y sepárala en atenciones individuales (múltiples atenciones).\n"
    )
    if cajero_nombre:
        user += f"CONTEXTO IMPORTANTE: El cajero que atiende se llama '{cajero_nombre}'. Utiliza esto para saber quién es el Cajero.\n"
    user += (
        "REGLAS DE SEGMENTACIÓN Y CONTINUACIÓN:\n"
        "- Identifica qué etiqueta de hablante corresponde al Cajero (el que da la bienvenida, dice precios, cobra, ofrece productos o se despide) y devuélvelo en 'cajero_speaker'. Presta atención a quién lidera la transacción.\n"
        "- Una atención inicia con un saludo (ej: 'Buenos días', 'Hola', '¿Cómo está?') o cuando el cliente inicia una transacción.\n"
        "- Termina con una despedida (ej: 'Gracias', 'Que le vaya bien') o al finalizar el cobro (facturación, entrega de cambio/ticket).\n"
        "- IMPORTANTE: Si la grabación inicia con la continuación directa de una conversación anterior (marcada al principio del texto), unifícala en la misma primera atención en lugar de iniciar una nueva.\n"
        "- Identifica múltiples atenciones reales. No inventes atenciones si no existen en el texto.\n"
        "- 'inicio_segmento' y 'fin_segmento' son los números enteros (índices) del primer y último segmento de la atención.\n"
        "- Si la última atención se corta abruptamente sin terminar, usa estado 'EN_PROCESO'. Si no, 'COMPLETADA'.\n\n"
        f"INPUT:\n{json.dumps(payload, ensure_ascii=False)}"
    )

    input_chars = len(system) + len(user)
    estimated_tokens = int(input_chars / 3.5)
    
    fallbacks = []
    if LLM_PROVIDER == "openai" and OPENAI_API_KEY:
        fallbacks.append(("openai", OPENAI_API_KEY, "OPENAI_PRINCIPAL"))
        if GROQ_API_KEY_1: fallbacks.append(("groq", GROQ_API_KEY_1, "GROQ_FALLBACK_1"))
        if GROQ_API_KEY_2: fallbacks.append(("groq", GROQ_API_KEY_2, "GROQ_FALLBACK_2"))
    else:
        if GROQ_API_KEY_1: fallbacks.append(("groq", GROQ_API_KEY_1, "LLAVE 1"))
        if GROQ_API_KEY_2: fallbacks.append(("groq", GROQ_API_KEY_2, "LLAVE 2"))
        if OPENAI_API_KEY: fallbacks.append(("openai", OPENAI_API_KEY, "OPENAI SALVAVIDAS"))
    
    if not fallbacks:
        raise RuntimeError("No hay ninguna llave configurada (ni Groq ni OpenAI).")

    last_error = None
    for provider, api_key, key_name in fallbacks:
        try:
            if provider == "groq":
                from groq import Groq
                client = Groq(api_key=api_key, max_retries=0)
                env_model = os.getenv("LLM_MODEL") or ""
                groq_model = env_model if "llama" in env_model.lower() or "mixtral" in env_model.lower() or "gemma" in env_model.lower() else "llama-3.3-70b-versatile"
                print(f"[LLM Extract] Intentando GROQ ({key_name}) con modelo {groq_model} | Caracteres: {input_chars} | Tokens: ~{estimated_tokens}")
                resp = client.chat.completions.create(
                    model=groq_model,
                    messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                    temperature=0.1,
                )
                log_llm_cost(f"GROQ_{key_name}", input_chars, payload)
                return _parse_json_strict((resp.choices[0].message.content or "").strip())
                
            elif provider == "openai":
                from openai import OpenAI
                client = OpenAI(api_key=api_key, max_retries=0)
                openai_model = os.getenv("LLM_MODEL") or "gpt-4o-mini"
                print(f"[LLM Extract] Intentando OPENAI ({key_name}) con modelo {openai_model} | Caracteres: {input_chars} | Tokens: ~{estimated_tokens}")
                resp = client.chat.completions.create(
                    model=openai_model,
                    messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                    temperature=0.1,
                    timeout=LLM_TIMEOUT_SEC,
                    response_format={"type": "json_object"},
                )
                log_llm_cost(f"OPENAI_{key_name}", input_chars, payload)
                return _parse_json_strict((resp.choices[0].message.content or "").strip())
        except Exception as e:
            last_error = f"{type(e).__name__}: {str(e)}"
            print(f"[LLM Extract] Falló {provider} ({key_name}): {last_error}. Pasando al siguiente proveedor...")
            time.sleep(1)
            
    raise RuntimeError(f"Todos los proveedores de LLM fallaron. Último error: {last_error}")

# =========================
# JOB
# =========================
def analyze_job(grabacion_id: str) -> Dict[str, Any]:
    """
    Wrapper de compatibilidad para workers antiguos (como cajas_worker_whisperx)
    que encolan 'analyze_job' en lugar de 'extract_atenciones_job'.
    """
    return extract_atenciones_job(grabacion_id)

def extract_atenciones_job(grabacion_id: str) -> Dict[str, Any]:
    t0 = time.perf_counter()
    import uuid
    import re
    from rq import Queue
    from redis import Redis

    with SessionLocal() as db:
        db.execute(
            text("UPDATE public.grabaciones SET estado_proceso=:st WHERE id=CAST(:id AS uuid)"),
            {"st": "EXTRACTING", "id": grabacion_id},
        )
        db.commit()

        # Get transcription ID and base info
        row = db.execute(
            text(
                "SELECT t.id, g.caja_id, g.usuario_id, g.fecha_hora_inicio, g.contacto_id "
                "FROM public.transcripciones t "
                "JOIN public.grabaciones g ON t.grabacion_id = g.id "
                "WHERE t.grabacion_id = CAST(:gid AS uuid) "
                "ORDER BY t.created_at DESC "
                "LIMIT 1"
            ),
            {"gid": grabacion_id},
        ).first()

        if not row or not row[0]:
            db.execute(
                text("UPDATE public.grabaciones SET estado_proceso=:st WHERE id=CAST(:id AS uuid)"),
                {"st": "FAILED_NO_TRANSCRIPT", "id": grabacion_id},
            )
            db.commit()
            return {"ok": False, "reason": "No hay transcripción"}

        transcripcion_id = str(row[0])
        caja_id = str(row[1])
        usuario_id = str(row[2]) if row[2] else None
        base_fecha_hora_inicio = row[3]
        contacto_id = str(row[4]) if row[4] else None

        # Get segments with timestamps and speaker labels
        segments = db.execute(
            text("SELECT id, inicio_segundo, fin_segundo, hablante, texto FROM public.segmentos_transcripcion WHERE transcripcion_id=CAST(:tid AS uuid) ORDER BY orden"),
            {"tid": transcripcion_id}
        ).fetchall()
        
        texto_con_tiempos = "\n".join([f"{i}. {s[3] or 'UNKNOWN'}: {s[4]}" for i, s in enumerate(segments, start=1)])

        # Find if there is a recent EN_PROCESO atencion for this caja (within 25 minutes of the current recording start)
        open_atencion = None
        if base_fecha_hora_inicio:
            open_atencion = db.execute(
                text(
                    "SELECT id::text, texto_transcripcion FROM public.atenciones "
                    "WHERE caja_id=CAST(:cid AS uuid) AND estado='EN_PROCESO' "
                    "AND created_at >= :base_time - INTERVAL '25 minutes' "
                    "ORDER BY created_at DESC LIMIT 1"
                ),
                {"cid": caja_id, "base_time": base_fecha_hora_inicio}
            ).first()

        texto_to_analyze = texto_con_tiempos
        if open_atencion:
            texto_to_analyze = (open_atencion[1] or "") + "\n\n" + texto_con_tiempos

        # Fetch contact name
        cajero_nombre = None
        if contacto_id:
            cajero_row = db.execute(
                text("SELECT nombre, apellido FROM public.contactos WHERE id=CAST(:cid AS uuid)"),
                {"cid": contacto_id}
            ).first()
            if cajero_row:
                cajero_nombre = f"{cajero_row[0]} {cajero_row[1]}".strip()

        # Call LLM to extract
        payload = {
            "texto_completo": texto_to_analyze[:120000],
            "cajero_nombre": cajero_nombre
        }
        try:
            out = call_llm_extract(payload)
        except Exception as e:
            db.execute(text("UPDATE public.grabaciones SET estado_proceso='FAILED_EXTRACT' WHERE id=CAST(:id AS uuid)"), {"id": grabacion_id})
            db.commit()
            raise e

        atenciones_list = out.get("atenciones", [])
        if not atenciones_list:
            print("[LLM Extract] No se extrajo ninguna atención. Creando atención por defecto para toda la grabación.")
            duracion_total = float(segments[-1][2]) if segments else 0.0
            atenciones_list = [{
                "estado": "COMPLETADA",
                "inicio_segundo": 0.0,
                "fin_segundo": duracion_total
            }]
        
        # 1) Establecer Baseline a nivel de hablante (Pyannote)
        db_cajero_spk = None
        try:
            res_met = db.execute(
                text("SELECT metricas FROM public.grabaciones WHERE id=CAST(:gid AS uuid)"),
                {"gid": grabacion_id}
            ).fetchone()
            if res_met and res_met[0]:
                metrics_dict = res_met[0]
                if isinstance(metrics_dict, str):
                    import json
                    try:
                        metrics_dict = json.loads(metrics_dict)
                    except:
                        metrics_dict = {}
                if isinstance(metrics_dict, dict):
                    db_cajero_spk = metrics_dict.get("cajero_speaker")
                    if db_cajero_spk:
                        print(f"[LLM Worker] Cajero detectado acústicamente en BD: {db_cajero_spk}")
        except Exception as e_met:
            print(f"[LLM Worker] No se pudo leer cajero_speaker de BD: {e_met}")

        cajero_spk = db_cajero_spk or out.get("cajero_speaker")
        if cajero_spk and isinstance(cajero_spk, str):
            cajero_spk = cajero_spk.strip().upper().replace(" ", "_").replace("-", "_")
            if cajero_spk in ["0", "00", "SPEAKER_0", "SPEAKER_00"]:
                cajero_spk = "SPEAKER_00"
            elif cajero_spk in ["1", "01", "SPEAKER_1", "SPEAKER_01"]:
                cajero_spk = "SPEAKER_01"
            elif not cajero_spk.startswith("SPEAKER_"):
                import re
                match = re.search(r"SPEAKER[_\s\-]?(\d+)", cajero_spk)
                if match:
                    num = int(match.group(1))
                    cajero_spk = f"SPEAKER_{num:02d}"
                else:
                    cajero_spk = None
        else:
            cajero_spk = None
        # Se removió la inferencia automática de roles ('Cajero', 'Usuario') para preservar 
        # directamente las etiquetas nativas 'SPEAKER_XX' de la diarización.


        # Save general summary row for the whole recording (atencion_id = NULL)
        resumen_gr = (out.get("resumen_general") or "").strip()
        sentimiento_gr = (out.get("sentimiento_general") or "NEUTRO").strip().upper()
        if resumen_gr:
            # Clean up old general summaries for this recording
            db.execute(
                text("DELETE FROM public.analisis_general WHERE grabacion_id=CAST(:gid AS uuid) AND atencion_id IS NULL"),
                {"gid": grabacion_id}
            )
            db.execute(
                text(
                    "INSERT INTO public.analisis_general "
                    "(grabacion_id, atencion_id, resumen_ejecutivo, sentimiento_general, calificacion_general, fecha_analisis) "
                    "VALUES (CAST(:gid AS uuid), NULL, :res, :sent, NULL, :fa)"
                ),
                {"gid": grabacion_id, "res": resumen_gr, "sent": sentimiento_gr, "fa": utcnow()}
            )
        
        # We will delete the previous EN_PROCESO because we are rewriting the state with the combined text
        if open_atencion:
            db.execute(text("DELETE FROM public.atenciones WHERE id=CAST(:aid AS uuid)"), {"aid": open_atencion[0]})
        
        redis_conn = Redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
        q_analysis = Queue("analysis", connection=redis_conn)

        for idx_aten, aten in enumerate(atenciones_list):
            estado = aten.get("estado", "COMPLETADA")
            
            idx_inicio = int(aten.get("inicio_segmento") or 1)
            idx_fin = int(aten.get("fin_segmento") or len(segments))
            
            idx_inicio = max(1, min(idx_inicio, len(segments)))
            idx_fin = max(1, min(idx_fin, len(segments)))

            inicio = float(segments[idx_inicio - 1][1]) if segments else 0.0
            fin = float(segments[idx_fin - 1][2]) if segments else 0.0

            txt_segments = []
            for i in range(idx_inicio - 1, idx_fin):
                if i < len(segments):
                    s = segments[i]
                    hablante_acustico = s[3]
                    if cajero_spk:
                        rol = "Cajero" if hablante_acustico == cajero_spk else "Usuario"
                    else:
                        rol = "Cajero" if hablante_acustico == 'SPEAKER_00' else "Usuario"
                    txt_segments.append(f"[{s[1]}s - {s[2]}s] {rol}:{s[4]}")
            
            texto = "\n".join(txt_segments)
            if not texto.strip():
                # Fallback por si no hubo segmentos en ese rango exacto
                texto = aten.get("texto_transcripcion", "").strip()

            # Prepend previous segment's text if this is the first attention (continuation)
            if idx_aten == 0 and open_atencion and open_atencion[1]:
                texto = open_atencion[1].strip() + "\n\n" + texto.strip()

            if not texto:
                continue
            
            from datetime import timedelta
            # Calculamos la fecha real de inicio y la duracion
            real_inicio = base_fecha_hora_inicio + timedelta(seconds=inicio) if base_fecha_hora_inicio else None
            duracion = max(0, int(fin - inicio))
            
            new_id = str(uuid.uuid4())
            db.execute(
                text("""
                INSERT INTO public.atenciones 
                (id, usuario_id, contacto_id, caja_id, grabacion_id, fecha_hora_inicio, fecha_hora_fin, duracion_segundos, texto_transcripcion, estado) 
                VALUES 
                (CAST(:id AS uuid), CAST(:uid AS uuid), CAST(:ctid AS uuid), CAST(:cid AS uuid), CAST(:gid AS uuid), :fhi, :fhf, :dur, :txt, :st)
                """),
                {
                    "id": new_id, 
                    "uid": usuario_id, 
                    "ctid": contacto_id,
                    "cid": caja_id, 
                    "gid": grabacion_id, 
                    "fhi": real_inicio, 
                    "fhf": real_inicio + timedelta(seconds=duracion) if real_inicio else None, 
                    "dur": duracion, 
                    "txt": texto, 
                    "st": estado
                }
            )
            
            if estado == "COMPLETADA":
                # Enqueue evaluate
                q_analysis.enqueue(
                    "rq_workers.llm_worker.evaluate_atencion_job",
                    new_id,
                    job_id=f"evaluate_{new_id}",
                    result_ttl=3600,
                    ttl=3600,
                    job_timeout=600,
                )

        db.execute(
            text("UPDATE public.grabaciones SET estado_proceso=:st WHERE id=CAST(:id AS uuid)"),
            {"st": "ANALYZED", "id": grabacion_id}, # Mark as ANALYZED because it's done extracting
        )
        db.commit()

    return {"ok": True, "grabacion_id": grabacion_id, "seconds": round(time.perf_counter() - t0, 2)}

def evaluate_atencion_job(atencion_id: str) -> Dict[str, Any]:
    t0 = time.perf_counter()
    with SessionLocal() as db:
        # Get atencion
        row = db.execute(
            text("SELECT texto_transcripcion, grabacion_id FROM public.atenciones WHERE id=CAST(:aid AS uuid)"),
            {"aid": atencion_id}
        ).first()
        
        if not row:
            return {"ok": False, "reason": "Atencion no existe"}
            
        texto = row[0]
        grabacion_id = row[1]
        
        # Cargar preguntas activas de catalogo_preguntas
        rows_preg = db.execute(text("SELECT id::text, texto_pregunta, instruccion_ia, configuracion_respuesta, ejemplo_respuesta_esperada FROM public.catalogo_preguntas WHERE activo=true")).fetchall()
        preguntas = [
            {"id": r[0], "texto_pregunta": r[1], "instruccion_ia": r[2], "configuracion_respuesta": r[3], "ejemplo_respuesta_esperada": r[4]} 
            for r in rows_preg
        ]

        if not preguntas:
            # Guardamos un análisis básico indicando que no hay métricas configuradas
            analisis_id_row = db.execute(
                text(
                    "INSERT INTO public.analisis_general "
                    "(grabacion_id, atencion_id, resumen_ejecutivo, sentimiento_general, calificacion_general, fecha_analisis) "
                    "VALUES (CAST(:gid AS uuid), CAST(:aid AS uuid), :res, :sent, :calif, :fa) "
                    "RETURNING id::text"
                ),
                {"gid": str(grabacion_id) if grabacion_id else None, "aid": atencion_id, "res": "Sin métricas de evaluación activas.", "sent": "NEUTRO", "calif": 100.0, "fa": utcnow()},
            ).first()
            db.commit()
            return {
                "ok": True,
                "atencion_id": atencion_id,
                "analisis_id": analisis_id_row[0],
                "seconds": 0,
            }

        payload = {
            "atencion_id": atencion_id,
            "texto_completo": texto[:120000],
        }

        out = call_llm(payload, preguntas)

        resumen = (out.get("resumen_ejecutivo") or "").strip()
        sentimiento = (out.get("sentimiento_general") or "NEUTRO").strip().upper()
        actitudes = (out.get("actitudes") or "").strip()
        calificacion = out.get("calificacion_general")
        if not isinstance(calificacion, (int, float)):
             calificacion = 0
        evaluaciones = out.get("evaluaciones") or []

        resumen_db = f"Preguntas Evaluadas: {len(evaluaciones)}\n\nActitudes Detectadas:\n{actitudes}\n\nResumen:\n{resumen}".strip()

        analisis_id_row = db.execute(
            text(
                "INSERT INTO public.analisis_general "
                "(grabacion_id, atencion_id, resumen_ejecutivo, sentimiento_general, calificacion_general, fecha_analisis) "
                "VALUES (CAST(:gid AS uuid), CAST(:aid AS uuid), :res, :sent, :calif, :fa) "
                "RETURNING id::text"
            ),
            {"gid": str(grabacion_id) if grabacion_id else None, "aid": atencion_id, "res": resumen_db, "sent": sentimiento, "calif": calificacion, "fa": utcnow()},
        ).first()
        analisis_id = analisis_id_row[0]

        # Mapa robusto de resolución de pregunta_id (por UUID, por número secuencial 1-N y por coincidencia de texto)
        preg_map = {}
        for idx, p in enumerate(preguntas, start=1):
            p_id_str = str(p["id"])
            preg_map[p_id_str.lower()] = p["id"]
            preg_map[str(idx)] = p["id"]
            preg_map[f"pregunta_{idx}"] = p["id"]

        for ev in evaluaciones:
            pid = ev.get("pregunta_id")
            cumple = bool(ev.get("cumple"))
            just = (ev.get("justificacion_ia") or "").strip()
            punt = ev.get("puntaje")

            # Intentar resolver pid de forma robusta
            resolved_pid = None
            if pid:
                pid_str = str(pid).strip().lower()
                resolved_pid = preg_map.get(pid_str)
                if not resolved_pid:
                    # Buscar por coincidencia aproximada de texto de la pregunta
                    for p in preguntas:
                        p_text = p["texto_pregunta"].strip().lower()
                        if pid_str in p_text or p_text in pid_str:
                            resolved_pid = p["id"]
                            break

            if not resolved_pid:
                # Si sigue siendo nulo, saltamos la fila
                continue

            # Usar el UUID de la pregunta resuelto
            pid = resolved_pid

            # Convertir puntaje a float o None de manera segura para evitar errores de tipo numérico en PostgreSQL
            punt_val = None
            if punt is not None:
                try:
                    punt_val = float(str(punt).replace(',', '.').strip())
                except (ValueError, TypeError):
                    punt_val = None

            db.execute(
                text(
                    "INSERT INTO public.respuestas_evaluacion "
                    "(analisis_id, pregunta_id, segmento_evidencia_id, respuesta_booleana, justificacion_ia, puntaje_obtenido, created_at) "
                    "VALUES (CAST(:aid AS uuid), CAST(:pid AS uuid), CAST(:sid AS uuid), :rb, :j, :punt, :ca)"
                ),
                {"aid": analisis_id, "pid": pid, "sid": None, "rb": cumple, "j": just, "punt": punt_val, "ca": utcnow()},
            )
        db.commit()

    return {
        "ok": True,
        "atencion_id": atencion_id,
        "analisis_id": analisis_id,
        "seconds": round(time.perf_counter() - t0, 2),
    }