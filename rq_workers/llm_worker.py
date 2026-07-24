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
LLM_TIMEOUT_SEC = int(os.getenv("LLM_TIMEOUT_SEC") or "120")

GROQ_API_KEY = (os.getenv("GROQ_API_KEY") or os.getenv("GROK_API_KEY") or "").strip()
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
        "Eres un analista de calidad de servicio y atención al cliente. "
        "Devuelve SIEMPRE JSON estricto, sin texto extra."
    )

    lista_preguntas_str = "\n".join([
        f"- ID: {p['id']} | Pregunta: {p['texto_pregunta']}" + 
        (f" | Criterio: {p['instruccion_ia']}" if p.get('instruccion_ia') and p['instruccion_ia'] != "Evalúa si se cumple o no la condición. Responde únicamente con 'true' (Sí) o 'false' (No)." else "") +
        (f" | CONFIG RESPUESTA: {p['configuracion_respuesta']}" if p.get('configuracion_respuesta') and p['configuracion_respuesta'] != "{}" else "")
        for p in preguntas
    ])

    compact_format = (
        "{\n"
        '  "resumen_ejecutivo": "Breve resumen de la interacción (máx. 2 frases).",\n'
        '  "sentimiento_general": "POSITIVO" | "NEUTRO" | "NEGATIVO",\n'
        '  "calificacion_general": 0 a 100,\n'
        '  "actitudes": "Breve descripción de actitudes del agente y cliente (máx. 1 frase).",\n'
        '  "evaluaciones": [\n'
        '    {\n'
        '      "pregunta_id": "ID de la pregunta",\n'
        '      "cumple": true | false,\n'
        '      "justificacion_ia": "Cita textual justificativa súper corta (máx. 5 palabras) o \'No se observa\'." \n'
        '    }\n'
        '  ]\n'
        "}"
    )

    user = (
        "Evalúa rigurosamente el cumplimiento de estándares en la siguiente atención al cliente.\n"
        "REGLAS DE EVALUACIÓN:\n"
        "- REGLA DE ORO DE MÉTRICAS: Debes incluir OBLIGATORIAMENTE una evaluación para cada una de las preguntas de la lista en la sección 'PREGUNTAS' sin omitir ninguna. Si no hay evidencia en la transcripción para alguna pregunta, evalúala con 'cumple': false y 'justificacion_ia': 'No se observa'. El número total de elementos en la lista 'evaluaciones' debe ser EXACTAMENTE el mismo número de preguntas proporcionadas.\n"
        "- Para cada ID de pregunta, evalúa estrictamente según su 'Criterio'. Si no se define criterio, asume que es una pregunta booleana de sí/no.\n"
        "- 'cumple': true si cumple plenamente la condición; false si hay omisión, falla o no aplica.\n"
        "- 'justificacion_ia': Cita súper corta (máx. 5 palabras) con marca de tiempo y hablante (ej: 'Cajero [14.5s]: Hola' o 'No se observa').\n"
        "- 'calificacion_general': Porcentaje de cumplimiento de 0 a 100, calculado como: (cantidad de cumple=true / total evaluaciones) * 100.\n"
        "- 'resumen_ejecutivo': Resumen conciso de la calidad de atención (máx. 2 frases).\n"
        "- 'actitudes': Actitud y tono emocional del agente y cliente (máx. 1 frase).\n\n"
        f"PREGUNTAS:\n{lista_preguntas_str}\n\n"
        f"FORMATO JSON:\n{compact_format}\n\n"
        f"INPUT:\n{json.dumps(payload, ensure_ascii=False)}"
    )

    max_retries = 2
    for attempt in range(1, max_retries + 1):
        try:
            if LLM_PROVIDER == "groq":
                if not GROQ_API_KEY:
                    raise RuntimeError("GROQ_API_KEY (o GROK_API_KEY) no está definido en .env")
                from groq import Groq
                client = Groq(api_key=GROQ_API_KEY, max_retries=0)
                resp = client.chat.completions.create(
                    model=LLM_MODEL or "llama-3.3-70b-versatile",
                    messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                    temperature=0.2,
                )
                return _parse_json_strict((resp.choices[0].message.content or "").strip())

            if LLM_PROVIDER == "openai":
                if not OPENAI_API_KEY:
                    raise RuntimeError("OPENAI_API_KEY no está definido en .env")
                from openai import OpenAI
                client = OpenAI(api_key=OPENAI_API_KEY, max_retries=0)
                resp = client.chat.completions.create(
                    model=LLM_MODEL or "gpt-4o-mini",
                    messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                    temperature=0.2,
                    timeout=LLM_TIMEOUT_SEC,
                    response_format={"type": "json_object"},
                )
                return _parse_json_strict((resp.choices[0].message.content or "").strip())

            raise RuntimeError(f"LLM_PROVIDER no soportado: {LLM_PROVIDER}")
        except Exception as e:
            if attempt == max_retries:
                raise e
            sleep_time = attempt * 3
            print(f"[LLM Call] Error en intento {attempt}/{max_retries}: {e}. Reintentando en {sleep_time}s...")
            time.sleep(sleep_time)

def call_llm_extract(payload: Dict[str, Any]) -> Dict[str, Any]:
    system = (
        "Eres un analizador de conversaciones de servicio al cliente. "
        "Devuelve SIEMPRE JSON estricto, sin texto extra."
    )

    compact_format = (
        "{\n"
        '  "cajero_speaker": "Identificador exacto de la persona que actúa como Cajero/Agente en la transcripción (ej: \'SPEAKER_00\' o \'SPEAKER_01\').",\n'
        '  "resumen_general": "Resumen ejecutivo de toda la grabación de 10 minutos (máx. 2 frases).",\n'
        '  "sentimiento_general": "POSITIVO" | "NEUTRO" | "NEGATIVO",\n'
        '  "roles_segmentos": {\n'
        '    "1": "Cajero" | "Usuario",\n'
        '    "2": "Cajero" | "Usuario"\n'
        '  },\n'
        '  "atenciones": [\n'
        '    {\n'
        '      "estado": "COMPLETADA" | "EN_PROCESO",\n'
        '      "inicio_segundo": número,\n'
        '      "fin_segundo": número\n'
        '    }\n'
        '  ]\n'
        "}"
    )

    cajero_nombre = payload.get("cajero_nombre")
    user = (
        "Analiza la transcripción de audio del cajero (duración aprox. 10 minutos) y sepárala en atenciones individuales (máx. 2).\n"
    )
    if cajero_nombre:
        user += f"CONTEXTO IMPORTANTE: El cajero que atiende se llama '{cajero_nombre}'. Utiliza esto para saber quién es el Cajero.\n"
    user += (
        "REGLAS DE SEGMENTACIÓN Y CONTINUACIÓN:\n"
        "- Identifica qué etiqueta de hablante corresponde al Cajero (el que saluda, cobra y atiende, ej: 'SPEAKER_00' o 'SPEAKER_01') y devuélvelo en 'cajero_speaker'.\n"
        "- Una atención inicia con un saludo (ej: 'Buenos días', 'Hola', '¿Cómo está?') o cuando el cliente inicia una transacción.\n"
        "- Termina con una despedida (ej: 'Gracias', 'Que le vaya bien') o al finalizar el cobro (facturación, entrega de cambio/ticket).\n"
        "- IMPORTANTE: Si la grabación inicia con la continuación directa de una conversación anterior (marcada al principio del texto), unifícala en la misma primera atención en lugar de iniciar una nueva.\n"
        "- Identifica de 0 a un MÁXIMO de 2 atenciones reales. No inventes atenciones si no existen en el texto.\n"
        "- 'inicio_segundo' y 'fin_segundo' son los números decimales exactos del primer y último segmento de la atención.\n"
        "- Si la última atención se corta abruptamente sin terminar, usa estado 'EN_PROCESO'. Si no, 'COMPLETADA'.\n"
        "- DIARIZACIÓN SEMÁNTICA DETALLADA OBLIGATORIA:\n"
        "  1. Para cada segmento numerado en el INPUT (ej: '1.', '2.', etc.), determina quién habla: 'Cajero' o 'Usuario'.\n"
        "  2. Devuelve este mapeo en 'roles_segmentos' con el número de segmento como clave y su rol como valor ('Cajero' o 'Usuario').\n"
        "  3. IMPORTANTE: Analiza semánticamente el texto de cada frase. El Cajero es quien ofrece productos, indica precios, cobra y saluda. El Usuario es el cliente que realiza pedidos, consulta precios o proporciona sus datos para facturar.\n"
        "  4. Si todos los segmentos de la transcripción tienen la misma etiqueta (ej: 'SPEAKER_00' o 'UNKNOWN') debido a fallos del micrófono, debes guiarte únicamente por el sentido de la frase para separar quién es el Cajero y quién es el Usuario en el diálogo.\n"
        "  5. Devuelve OBLIGATORIAMENTE la clave en 'roles_segmentos' para todos y cada uno de los números de segmento del INPUT sin omitir ninguno por pereza.\n\n"
        f"FORMATO JSON:\n{compact_format}\n\n"
        f"INPUT:\n{json.dumps(payload, ensure_ascii=False)}"
    )

    max_retries = 2
    for attempt in range(1, max_retries + 1):
        try:
            if LLM_PROVIDER == "groq":
                if not GROQ_API_KEY:
                    raise RuntimeError("GROQ_API_KEY no está definido")
                from groq import Groq
                client = Groq(api_key=GROQ_API_KEY, max_retries=0)
                resp = client.chat.completions.create(
                    model=LLM_MODEL or "llama-3.3-70b-versatile",
                    messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                    temperature=0.1,
                    response_format={"type": "json_object"}
                )
                return _parse_json_strict((resp.choices[0].message.content or "").strip())

            if LLM_PROVIDER == "openai":
                if not OPENAI_API_KEY:
                    raise RuntimeError("OPENAI_API_KEY no está definido en .env")
                from openai import OpenAI
                client = OpenAI(api_key=OPENAI_API_KEY, max_retries=0)
                resp = client.chat.completions.create(
                    model=LLM_MODEL or "gpt-4o-mini",
                    messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                    temperature=0.1,
                    timeout=LLM_TIMEOUT_SEC,
                    response_format={"type": "json_object"},
                )
                return _parse_json_strict((resp.choices[0].message.content or "").strip())

            raise RuntimeError(f"LLM_PROVIDER no soportado para extract: {LLM_PROVIDER}")
        except Exception as e:
            if attempt == max_retries:
                raise e
            sleep_time = attempt * 3
            print(f"[LLM Extract] Error en intento {attempt}/{max_retries}: {e}. Reintentando en {sleep_time}s...")
            time.sleep(sleep_time)

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
        
        texto_con_tiempos = "\n".join([f"{i}. [{s[1]}s - {s[2]}s] {s[3] or 'UNKNOWN'}: {s[4]}" for i, s in enumerate(segments, start=1)])

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
        cajero_spk = out.get("cajero_speaker")
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

        if cajero_spk:
            db.execute(
                text("UPDATE public.segmentos_transcripcion SET rol_inferido='Cajero' WHERE transcripcion_id=CAST(:tid AS uuid) AND hablante=:spk"),
                {"tid": transcripcion_id, "spk": cajero_spk}
            )
            db.execute(
                text("UPDATE public.segmentos_transcripcion SET rol_inferido='Usuario' WHERE transcripcion_id=CAST(:tid AS uuid) AND (hablante!=:spk OR hablante IS NULL)"),
                {"tid": transcripcion_id, "spk": cajero_spk}
            )
        else:
            # Fallback si no se detecta cajero_speaker: SPEAKER_00 por defecto es Cajero
            db.execute(
                text("UPDATE public.segmentos_transcripcion SET rol_inferido='Cajero' WHERE transcripcion_id=CAST(:tid AS uuid) AND (hablante='SPEAKER_00' OR hablante IS NULL)"),
                {"tid": transcripcion_id}
            )
            db.execute(
                text("UPDATE public.segmentos_transcripcion SET rol_inferido='Usuario' WHERE transcripcion_id=CAST(:tid AS uuid) AND hablante!='SPEAKER_00' AND hablante IS NOT NULL"),
                {"tid": transcripcion_id}
            )

        # 2) Sobrescribir con la diarización semántica detallada segmento por segmento del LLM (soporta string, list y dict)
        roles_seg = out.get("roles_segmentos")
        role_list = []
        if isinstance(roles_seg, str) and roles_seg:
            role_list = [r.strip().upper() for r in roles_seg.split(",") if r.strip()]
        elif isinstance(roles_seg, list):
            role_list = [str(r).strip().upper() for r in roles_seg]
        elif isinstance(roles_seg, dict):
            try:
                import re
                parsed_roles = {}
                for k, v in roles_seg.items():
                    match = re.search(r"\d+", str(k))
                    if match:
                        idx = int(match.group(0))
                        parsed_roles[idx] = str(v).strip().upper()
                
                if parsed_roles:
                    max_idx = max(parsed_roles.keys())
                    role_list = [None] * max_idx
                    for idx, val in parsed_roles.items():
                        role_list[idx - 1] = val
            except Exception as e:
                log.warning("Error al parsear roles_segmentos dict: %s", e)

        for idx, r_char in enumerate(role_list):
            if r_char and idx < len(segments):
                seg_id = segments[idx][0]
                # 'C' o 'CAJERO' -> Cajero, 'U' o 'USUARIO' -> Usuario
                val_role = "Cajero" if any(x in r_char for x in ["C", "CAJ"]) else "Usuario"
                db.execute(
                    text("UPDATE public.segmentos_transcripcion SET rol_inferido=:role WHERE id=CAST(:id AS uuid)"),
                    {"role": val_role, "id": str(seg_id)}
                )
        
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
            inicio = float(aten.get("inicio_segundo") or 0)
            fin = float(aten.get("fin_segundo") or 0)

            # Reconstruir texto_transcripcion a partir de los segmentos en ese rango de tiempo (tolerancia de 1.5 segundos)
            txt_segments = []
            for s in segments:
                s_ini = float(s[1])
                s_fin = float(s[2])
                if (s_ini >= inicio - 1.5) and (s_fin <= fin + 1.5):
                    txt_segments.append(f"[{s[1]}s - {s[2]}s] {s[3] or 'UNKNOWN'}: {s[4]}")
            
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
        rows_preg = db.execute(text("SELECT id::text, texto_pregunta, instruccion_ia, configuracion_respuesta FROM public.catalogo_preguntas WHERE activo=true")).fetchall()
        preguntas = [
            {"id": r[0], "texto_pregunta": r[1], "instruccion_ia": r[2], "configuracion_respuesta": r[3]} 
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