-- Script para hacer dinámicos los prompts y respuestas de métricas.
-- Ejecutar este archivo contra tu base de datos `gestion_audios_cajas`.

ALTER TABLE public.catalogo_preguntas
ADD COLUMN IF NOT EXISTS tipo_respuesta VARCHAR(50) DEFAULT 'ESCALA_NUMERICA',
ADD COLUMN IF NOT EXISTS configuracion_respuesta JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS instruccion_ia TEXT;

-- Configurar CES (Customer Effort Score) - Menor es mejor
UPDATE public.catalogo_preguntas
SET 
  tipo_respuesta = 'ESCALA_NUMERICA',
  configuracion_respuesta = '{"min": 1, "max": 5}'::jsonb,
  instruccion_ia = '1=muy fácil, 5=muy difícil'
WHERE id = '11111111-1111-1111-1111-111111111111';

-- Configurar INS (Satisfacción) - Mayor es mejor
UPDATE public.catalogo_preguntas
SET 
  tipo_respuesta = 'ESCALA_NUMERICA',
  configuracion_respuesta = '{"min": 1, "max": 10}'::jsonb,
  instruccion_ia = '1=muy insatisfecho, 10=muy satisfecho'
WHERE id = '22222222-2222-2222-2222-222222222222';

-- Configurar NPS (Net Promoter Score) - Mayor es mejor
UPDATE public.catalogo_preguntas
SET 
  tipo_respuesta = 'ESCALA_NUMERICA',
  configuracion_respuesta = '{"min": 0, "max": 10}'::jsonb,
  instruccion_ia = '0=nada probable recomendar, 10=totalmente probable'
WHERE id = '33333333-3333-3333-3333-333333333333';

-- NOTA:
-- Si quisieras agregar una pregunta condicional en el futuro, harías:
-- INSERT INTO public.catalogo_preguntas (categoria_id, texto_pregunta, tipo_respuesta, configuracion_respuesta, instruccion_ia)
-- VALUES (
--   'd103aa97-beb6-468e-85d7-f1f4e7594707',
--   'El problema fue resuelto en la primera llamada',
--   'BOOLEANO',
--   '{}'::jsonb,
--   'Identifica si el cliente reporta que su problema se resolvió durante la interacción inicial y responde true o false. Si es indefinido pon false.'
-- );
