from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.router import router as v1_router

app = FastAPI(title=settings.app_name)

@app.on_event("startup")
async def startup_event():
    import logging
    from sqlalchemy import text
    from app.db.session import engine
    logging.info("Checking database schema...")
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS estado_operativo VARCHAR(50) DEFAULT 'Operativa';"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS estado_grabacion VARCHAR(50) DEFAULT 'apagado';"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS turno_manana_inicio TIME DEFAULT '07:30:00';"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS turno_manana_fin TIME DEFAULT '12:00:00';"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS turno_tarde_inicio TIME DEFAULT '16:00:00';"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS turno_tarde_fin TIME DEFAULT '19:00:00';"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS grabacion_habilitada BOOLEAN DEFAULT TRUE;"))
            await conn.execute(text("ALTER TABLE cajas ADD COLUMN IF NOT EXISTS en_pausa BOOLEAN DEFAULT FALSE;"))
            await conn.execute(text("ALTER TABLE contactos ADD COLUMN IF NOT EXISTS rol VARCHAR(50);"))
            await conn.execute(text("ALTER TABLE grabaciones ALTER COLUMN usuario_id DROP NOT NULL;"))
            await conn.execute(text("ALTER TABLE atenciones ALTER COLUMN usuario_id DROP NOT NULL;"))
            await conn.execute(text("ALTER TABLE grabaciones ADD COLUMN IF NOT EXISTS contacto_id UUID REFERENCES contactos(id) ON DELETE SET NULL;"))
            await conn.execute(text("ALTER TABLE atenciones ADD COLUMN IF NOT EXISTS contacto_id UUID REFERENCES contactos(id) ON DELETE SET NULL;"))
            logging.info("Added columns and constraints for cashiers without user accounts.")
            
            # --- AUTO DB REPAIR & ALIGNMENT ---
            logging.info("Running automatic database repair and alignment...")
            # 1. Update grabaciones.contacto_id based on grabaciones.usuario_id
            await conn.execute(text("""
                UPDATE public.grabaciones g
                SET contacto_id = u.contacto_id
                FROM public.usuarios u
                WHERE g.usuario_id = u.id AND g.contacto_id IS NULL;
            """))
            # 2. Update grabaciones.usuario_id based on grabaciones.contacto_id
            await conn.execute(text("""
                UPDATE public.grabaciones g
                SET usuario_id = u.id
                FROM public.usuarios u
                WHERE g.contacto_id = u.contacto_id AND g.usuario_id IS NULL;
            """))
            # 3. Update atenciones.contacto_id and usuario_id based on linked grabaciones
            await conn.execute(text("""
                UPDATE public.atenciones a
                SET contacto_id = g.contacto_id,
                    usuario_id = g.usuario_id
                FROM public.grabaciones g
                WHERE a.grabacion_id = g.id 
                  AND (
                    (a.contacto_id IS NULL AND g.contacto_id IS NOT NULL) OR
                    (a.usuario_id IS NULL AND g.usuario_id IS NOT NULL)
                  );
            """))
            # 4. Fallback: Update atenciones missing contact but having user_id
            await conn.execute(text("""
                UPDATE public.atenciones a
                SET contacto_id = u.contacto_id
                FROM public.usuarios u
                WHERE a.usuario_id = u.id AND a.contacto_id IS NULL;
            """))
            logging.info("✓ Database repair and alignment completed successfully.")

            # --- DIAGNOSTIC LOGS FOR DEBUGGING ---
            logging.info("--- DATABASE DIAGNOSTIC SUMMARY ---")
            
            # Count recordings by status
            rec_status = await conn.execute(text("""
                SELECT estado_proceso, COUNT(*) 
                FROM public.grabaciones 
                GROUP BY estado_proceso;
            """))
            for status, count in rec_status.fetchall():
                logging.info(f"Recordings in state '{status}': {count}")
                
            # Count total atenciones
            tot_atenciones = await conn.execute(text("SELECT COUNT(*) FROM public.atenciones;"))
            logging.info(f"Total atenciones in DB: {tot_atenciones.scalar()}")

            # Check if contact 'Alexander Prueba' exists and has recordings/atenciones
            alex_info = await conn.execute(text("""
                SELECT c.id, 
                       (SELECT COUNT(*) FROM public.grabaciones WHERE contacto_id = c.id) as rec_count,
                       (SELECT COUNT(*) FROM public.atenciones WHERE contacto_id = c.id) as aten_count
                FROM public.contactos c
                WHERE c.nombre ILIKE 'Alexander%' AND c.apellido ILIKE 'Prueba%'
                LIMIT 1;
            """))
            alex_row = alex_info.first()
            if alex_row:
                logging.info(f"Alexander Prueba - Contact ID: {alex_row[0]} | Recordings: {alex_row[1]} | Atenciones: {alex_row[2]}")
                # Log state of Alexander's recordings
                alex_recs = await conn.execute(text(f"""
                    SELECT estado_proceso, COUNT(*) 
                    FROM public.grabaciones 
                    WHERE contacto_id = '{alex_row[0]}'
                    GROUP BY estado_proceso;
                """))
                for status, count in alex_recs.fetchall():
                    logging.info(f"  -> Alexander's recordings in state '{status}': {count}")
            else:
                logging.info("Alexander Prueba contact not found in DB!")
            logging.info("-----------------------------------")
            
            # --- AUTO REPROCESS FAILED & STUCK JOBS ---
            try:
                import redis
                from rq import Queue
                redis_conn = redis.Redis.from_url(settings.redis_url)
                q_enhance = Queue("enhance", connection=redis_conn)
                q_whisperx = Queue("whisperx", connection=redis_conn)
                q_analysis = Queue("analysis", connection=redis_conn)
                
                # 1. Reprocess FAILED_EXTRACT
                res_failed_ext = await conn.execute(text(
                    "SELECT id FROM public.grabaciones WHERE estado_proceso = 'FAILED_EXTRACT'"
                ))
                for r in res_failed_ext.fetchall():
                    gid = str(r[0])
                    await conn.execute(text("UPDATE public.grabaciones SET estado_proceso = 'TRANSCRIBED' WHERE id = :id"), {"id": gid})
                    q_analysis.enqueue(
                        "rq_workers.llm_worker.extract_atenciones_job",
                        gid,
                        job_id=f"analysis_{gid}",
                        result_ttl=3600,
                        ttl=3600,
                        job_timeout=600,
                    )
                    logging.info(f"Auto-queued analysis for FAILED_EXTRACT recording: {gid}")
                    
                # 2. Reprocess FAILED
                res_failed = await conn.execute(text(
                    "SELECT id, fecha_hora_inicio FROM public.grabaciones WHERE estado_proceso = 'FAILED'"
                ))
                for r in res_failed.fetchall():
                    gid = str(r[0])
                    dt_start = r[1]
                    t_res = await conn.execute(text("SELECT id FROM public.transcripciones WHERE grabacion_id = :gid LIMIT 1"), {"gid": gid})
                    if t_res.first():
                        await conn.execute(text("UPDATE public.grabaciones SET estado_proceso = 'TRANSCRIBED' WHERE id = :id"), {"id": gid})
                        q_analysis.enqueue(
                            "rq_workers.llm_worker.extract_atenciones_job",
                            gid,
                            job_id=f"analysis_{gid}",
                            result_ttl=3600,
                            ttl=3600,
                            job_timeout=600,
                        )
                        logging.info(f"Auto-queued analysis for FAILED recording (has transcript): {gid}")
                    elif dt_start:
                        yyyymmdd = dt_start.strftime("%Y%m%d")
                        incoming_path = f"/app/storage/incoming/{yyyymmdd}/{gid}.wav"
                        await conn.execute(text("UPDATE public.grabaciones SET estado_proceso = 'ENHANCE_QUEUED' WHERE id = :id"), {"id": gid})
                        q_enhance.enqueue(
                            "rq_workers.enhance_worker.enhance_job",
                            gid,
                            incoming_path,
                            yyyymmdd,
                            job_id=gid,
                            result_ttl=3600,
                            ttl=3600,
                            job_timeout=600,
                        )
                        logging.info(f"Auto-queued enhance for FAILED recording (no transcript): {gid}")
                        
                # 3. Reprocess Stuck jobs (> 15 minutes)
                res_stuck = await conn.execute(text("""
                    SELECT id, estado_proceso, fecha_hora_inicio 
                    FROM public.grabaciones 
                    WHERE estado_proceso IN ('ENHANCE_QUEUED', 'ENHANCING', 'TRANSCRIBING', 'EXTRACTING', 'WHISPERX_QUEUED')
                      AND created_at < NOW() - INTERVAL '15 minutes'
                """))
                for r in res_stuck.fetchall():
                    gid = str(r[0])
                    estado = r[1]
                    dt_start = r[2]
                    if not dt_start: continue
                    yyyymmdd = dt_start.strftime("%Y%m%d")
                    
                    if estado in ('ENHANCE_QUEUED', 'ENHANCING'):
                        incoming_path = f"/app/storage/incoming/{yyyymmdd}/{gid}.wav"
                        await conn.execute(text("UPDATE public.grabaciones SET estado_proceso = 'ENHANCE_QUEUED' WHERE id = :id"), {"id": gid})
                        q_enhance.enqueue(
                            "rq_workers.enhance_worker.enhance_job",
                            gid,
                            incoming_path,
                            yyyymmdd,
                            job_id=gid,
                            result_ttl=3600,
                            ttl=3600,
                            job_timeout=600,
                        )
                        logging.info(f"Auto-queued stuck enhance job: {gid}")
                    elif estado in ('TRANSCRIBING', 'WHISPERX_QUEUED'):
                        await conn.execute(text("UPDATE public.grabaciones SET estado_proceso = 'WHISPERX_QUEUED' WHERE id = :id"), {"id": gid})
                        q_whisperx.enqueue(
                            "whisperx_worker.whisperx_worker.transcribe_job",
                            gid,
                            yyyymmdd,
                            job_id=f"whisperx_{gid}",
                            result_ttl=3600,
                            ttl=3600,
                            job_timeout=1800,
                        )
                        logging.info(f"Auto-queued stuck transcribe job: {gid}")
                    elif estado == 'EXTRACTING':
                        await conn.execute(text("UPDATE public.grabaciones SET estado_proceso = 'TRANSCRIBED' WHERE id = :id"), {"id": gid})
                        q_analysis.enqueue(
                            "rq_workers.llm_worker.extract_atenciones_job",
                            gid,
                            job_id=f"analysis_{gid}",
                            result_ttl=3600,
                            ttl=3600,
                            job_timeout=600,
                        )
                        logging.info(f"Auto-queued stuck analysis job: {gid}")
            except Exception as e:
                logging.error(f"Error auto-reprocessing failed or stuck jobs: {e}")
            
    except Exception as e:
        logging.error(f"Error checking schema or running db repair: {e}")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router)

@app.get("/diagnostics")
async def get_diagnostics():
    import logging
    from sqlalchemy import text
    from app.db.session import engine
    import redis
    from rq import Queue, Worker
    
    result = {}
    
    # 1. DB connection and query
    try:
        async with engine.begin() as conn:
            # Count recordings by status
            rec_status_res = await conn.execute(text("SELECT estado_proceso, COUNT(*) FROM public.grabaciones GROUP BY estado_proceso;"))
            result["recordings_by_state"] = {r[0]: r[1] for r in rec_status_res.fetchall()}
            
            # Count total atenciones
            tot_atenciones_res = await conn.execute(text("SELECT COUNT(*) FROM public.atenciones;"))
            result["total_atenciones"] = tot_atenciones_res.scalar()
            
            # Find Alexander Prueba contact
            alex_res = await conn.execute(text("""
                SELECT id::text, nombre, apellido, rol FROM public.contactos 
                WHERE nombre ILIKE 'Alexander%' AND apellido ILIKE 'Prueba%'
                LIMIT 1;
            """))
            alex = alex_res.first()
            if alex:
                alex_id = alex[0]
                result["alexander_contact"] = {"id": alex_id, "nombre": alex[1], "apellido": alex[2], "rol": alex[3]}
                
                # Alexander recordings
                alex_recs_res = await conn.execute(text("""
                    SELECT id::text, estado_proceso, usuario_id::text, contacto_id::text, created_at 
                    FROM public.grabaciones 
                    WHERE contacto_id = :cid OR usuario_id IN (SELECT id FROM public.usuarios WHERE contacto_id = :cid)
                    ORDER BY created_at DESC LIMIT 10;
                """), {"cid": alex_id})
                result["alexander_recordings"] = [
                    {"id": r[0], "estado_proceso": r[1], "usuario_id": r[2], "contacto_id": r[3], "created_at": r[4].isoformat() if r[4] else None}
                    for r in alex_recs_res.fetchall()
                ]
                
                # Alexander atenciones
                alex_atens_res = await conn.execute(text("""
                    SELECT id::text, estado, grabacion_id::text, contacto_id::text, usuario_id::text, created_at 
                    FROM public.atenciones 
                    WHERE contacto_id = :cid OR usuario_id IN (SELECT id FROM public.usuarios WHERE contacto_id = :cid)
                    ORDER BY created_at DESC LIMIT 10;
                """), {"cid": alex_id})
                result["alexander_atenciones"] = [
                    {"id": r[0], "estado": r[1], "grabacion_id": r[2], "contacto_id": r[3], "usuario_id": r[4], "created_at": r[5].isoformat() if r[5] else None}
                    for r in alex_atens_res.fetchall()
                ]
            else:
                result["alexander_contact"] = None
                
            result["db_connected"] = True
    except Exception as e:
        result["db_connected"] = False
        result["db_error"] = str(e)
        
    # 2. Redis and RQ queues
    try:
        redis_conn = redis.Redis.from_url(settings.redis_url)
        q_enhance = Queue("enhance", connection=redis_conn)
        q_whisperx = Queue("whisperx", connection=redis_conn)
        q_analysis = Queue("analysis", connection=redis_conn)
        
        result["redis_connected"] = True
        result["queues"] = {
            "enhance_size": len(q_enhance),
            "whisperx_size": len(q_whisperx),
            "analysis_size": len(q_analysis)
        }
        
        # Get active workers
        workers = Worker.all(connection=redis_conn)
        result["active_workers"] = [w.name for w in workers]
    except Exception as e:
        result["redis_connected"] = False
        result["redis_error"] = str(e)
        
    return result

@app.get("/health")
async def health():
    return {"status": "ok"}
