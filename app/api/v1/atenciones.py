from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import uuid
from app.db.session import get_db
from app.api.deps import get_current_user

router = APIRouter()

@router.get("/usuarios/{usuario_id}/atenciones")
async def get_atenciones_cajero(
    usuario_id: uuid.UUID,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # uid could be a Usuario.id or a Contacto.id
    # We query the DB to get both IDs.
    user_stmt = """
    SELECT u.id as user_id, c.id as contact_id 
    FROM public.contactos c
    LEFT JOIN public.usuarios u ON u.contacto_id = c.id
    WHERE c.id = CAST(:uid AS uuid) OR u.id = CAST(:uid AS uuid)
    """
    res = await db.execute(text(user_stmt), {"uid": str(usuario_id)})
    row = res.first()
    
    user_id_str = None
    contact_id_str = None
    if row:
        user_id_str = str(row[0]) if row[0] else None
        contact_id_str = str(row[1]) if row[1] else None
    else:
        # Fallback to the ID itself
        contact_id_str = str(usuario_id)

    query = """
    SELECT 
        a.id, a.fecha_hora_inicio, a.fecha_hora_fin, a.duracion_segundos, 
        a.texto_transcripcion, a.estado,
        ag.id as analisis_id, ag.sentimiento_general, ag.calificacion_general,
        a.grabacion_id
    FROM public.atenciones a
    LEFT JOIN public.analisis_general ag ON ag.atencion_id = a.id
    WHERE a.contacto_id = CAST(:cid AS uuid) 
       OR (CAST(:uid AS uuid) IS NOT NULL AND a.usuario_id = CAST(:uid AS uuid)) 
       OR a.usuario_id = CAST(:cid AS uuid)
    ORDER BY a.created_at DESC
    LIMIT 50
    """
    result = await db.execute(text(query), {"cid": contact_id_str, "uid": user_id_str})
    rows = result.fetchall()
    
    return [
        {
            "id": str(r[0]),
            "fecha_hora_inicio": r[1],
            "fecha_hora_fin": r[2],
            "duracion_segundos": r[3],
            "texto_transcripcion": r[4],
            "estado": r[5],
            "analisis_id": str(r[6]) if r[6] else None,
            "sentimiento_general": r[7] if r[6] else None,
            "calificacion_general": float(r[8]) if r[6] and r[8] is not None else None,
            "grabacion_id": str(r[9]) if r[9] else None
        }
        for r in rows
    ]

@router.get("/atenciones/{atencion_id}/analisis")
async def get_analisis_atencion(
    atencion_id: uuid.UUID,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query_ag = """
    SELECT id, resumen_ejecutivo, sentimiento_general, calificacion_general, fecha_analisis
    FROM public.analisis_general
    WHERE atencion_id = :aid
    LIMIT 1
    """
    res_ag = await db.execute(text(query_ag), {"aid": str(atencion_id)})
    row_ag = res_ag.first()
    
    if not row_ag:
        raise HTTPException(status_code=404, detail="Análisis no encontrado")
        
    ag_id = row_ag[0]
    
    query_resp = """
    SELECT re.id, re.pregunta_id, re.respuesta_booleana, re.justificacion_ia, cp.texto_pregunta, re.puntaje_obtenido, cat.nombre as categoria_nombre
    FROM public.respuestas_evaluacion re
    JOIN public.catalogo_preguntas cp ON re.pregunta_id = cp.id
    LEFT JOIN public.categorias_preguntas cat ON cp.categoria_id = cat.id
    WHERE re.analisis_id = :ag_id
    """
    res_resp = await db.execute(text(query_resp), {"ag_id": str(ag_id)})
    rows_resp = res_resp.fetchall()
    
    return {
        "id": str(ag_id),
        "atencion_id": str(atencion_id),
        "resumen_ejecutivo": row_ag[1],
        "sentimiento_general": row_ag[2],
        "calificacion_general": float(row_ag[3]) if row_ag[3] is not None else None,
        "fecha_analisis": row_ag[4],
        "evaluaciones": [
            {
                "id": str(r[0]),
                "pregunta_id": str(r[1]),
                "cumple": r[2],
                "justificacion_ia": r[3],
                "pregunta_texto": r[4],
                "puntaje": float(r[5]) if r[5] is not None else None,
                "categoria_nombre": r[6] if len(r) > 6 else None
            }
            for r in rows_resp
        ]
    }
