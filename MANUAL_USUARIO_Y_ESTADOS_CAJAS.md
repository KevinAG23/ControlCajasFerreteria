# 📘 Manual de Usuario y Guía de Estados del Sistema de Cajas

Sistema Integral de Monitoreo de Audio, Detección de Turnos y Auditoría de Atención al Cliente con Inteligencia Artificial.

---

## 📑 Tabla de Contenidos
1. [Introducción y Arquitectura General](#1-introducción-y-arquitectura-general)
2. [Matriz de Estados de la Caja](#2-matriz-de-estados-de-la-caja)
   - [2.1 Estado Operativo (`estado_operativo`)](#21-estado-operativo-estado_operativo)
   - [2.2 Estado de Conexión y Agente (`estado_grabacion`)](#22-estado-de-conexión-y-agente-estado_grabacion)
   - [2.3 Estado de Uso y Asignación de Cajero (`en_uso`)](#23-estado-de-uso-y-asignación-de-cajero-en_uso)
   - [2.4 Estado de Buffer de Diálogo en Tiempo Real](#24-estado-de-buffer-de-diálogo-en-tiempo-real)
3. [Ciclo de Vida de Grabaciones y Atenciones](#3-ciclo-de-vida-de-grabaciones-y-atenciones)
   - [3.1 Pipeline de Procesamiento de Audio](#31-pipeline-de-procesamiento-de-audio)
   - [3.2 Estados de una Atención al Cliente](#32-estados-de-una-atención-al-cliente)
4. [Manual de Operación: Panel Web de Administración](#4-manual-de-operación-panel-web-de-administración)
   - [4.1 Gestión de Cajas y Sucursales](#41-gestión-de-cajas-y-sucursales)
   - [4.2 Configuración y CRUD de Métricas con IA](#42-configuración-y-crud-de-métricas-con-ia)
   - [4.3 Análisis y Auditoría de Cajeros](#43-análisis-y-auditoría-de-cajeros)
   - [4.4 Reporte de Costos de Tokens](#44-reporte-de-costos-de-tokens)
5. [Manual del Agente de Escritorio (Windows)](#5-manual-del-agente-de-escritorio-windows)
6. [Mantenimiento y Solución de Problemas (Troubleshooting)](#6-mantenimiento-y-solución-de-problemas-troubleshooting)

---

## 1. Introducción y Arquitectura General

La plataforma supervisa y audita automáticamente la calidad de atención comercial en los puestos de caja de la ferretería. 

El ecosistema está compuesto por:
1. **Agente de Grabación Windows (`CajaRecorderAgent`)**: Aplicación nativa que captura el audio del micrófono asignado a la caja física, divide la grabación en segmentos (típicamente de 10 a 20 minutos) y los transmite al almacenamiento central.
2. **Pipeline de Procesamiento e Inteligencia Artificial**:
   - **Worker Enhance (DSP)**: Limpieza acústica, reducción de ruido (FFT / RNNoise) y normalización vocal inteligente.
   - **Worker WhisperX (ASR + Diarización)**: Transcripción rápida y precisa con aceleración CUDA/GPU, alineación temporal fonética y segmentación de hablantes con Pyannote (`SPEAKER_00`, `SPEAKER_01`).
   - **Worker Analysis (LLM)**: Identificación del rol del cajero, separación de atenciones individuales y evaluación de preguntas del catálogo mediante modelos de lenguaje (OpenAI GPT-4o-mini / Groq).
3. **Backend API (FastAPI + PostgreSQL + Redis/RQ)**: Orquestador de base de datos, colas asíncronas y autenticación JWT.
4. **Portal Web Administrativo (React + Vite)**: Interfaz responsiva para visualización en tiempo real, gestión de cajas, catálogo de preguntas de calidad y reportes analíticos.

```
[ Micrófono de Caja ]
        │
        ▼
[ Agente Windows ] ── (Envío de WAV) ──► [ Storage Central ]
                                               │
               ┌───────────────────────────────┴───────────────────────────────┐
               ▼                                                               ▼
       [ Cola Enhance ] ──► [ Cola WhisperX ] ──► [ Cola Analysis (LLM) ] ──► [ Base de Datos ]
        (Filtros Audio)      (Transcripción +      (Segmentación +                  │
                              Diarización)          Evaluación Métricas)            ▼
                                                                           [ Panel Web React ]
```

---

## 2. Matriz de Estados de la Caja

Cada caja física posee múltiples dimensiones de estado que determinan si puede grabar, si está siendo operada por un cajero, y si sus componentes técnicos están en buen funcionamiento.

### 2.1 Estado Operativo (`estado_operativo`)
Define la condición técnica y administrativa del puesto de caja. Se configura desde el panel de administración.

| Estado | Indicador Visual | Descripción | Comportamiento del Sistema |
| :--- | :---: | :--- | :--- |
| **Operativa** | 🟢 Verde (`#15803d` / `#dcfce7`) | La caja se encuentra en perfectas condiciones técnicas para operar. | Permite inicio de sesión de cajeros, habilita la grabación programada y procesa audios con normalidad. |
| **En Mantenimiento** | 🟡 Amarillo (`#854d0e` / `#fef08a`) | La caja está en revisión técnica preventiva o correctiva (problemas con el micrófono, cables, PC lenta, etc.). | Se suspende temporalmente la alerta de falta de grabaciones. Permite registrar un campo de texto con el **Motivo del Estado** (ej. *"Cambio de cable USB de micrófono"*). |
| **Fuera de Servicio** | 🔴 Rojo (`#991b1b` / `#fee2e2`) | La caja está inhabilitada por tiempo prolongado (puesto clausurado, remodelación, falta de personal). | El sistema bloquea el inicio de sesión y desactiva las alertas de inactividad para ese terminal. |

> [!TIP]
> **Campo Motivo / Factor (`motivo_estado`):** Cuando una caja se pasa a *En Mantenimiento* o *Fuera de Servicio*, el administrador puede especificar la razón técnica en el formulario para que todo el equipo conozca la causa de la parada.

---

### 2.2 Estado de Conexión y Agente (`estado_grabacion`)
Refleja la comunicación en tiempo real entre el programa de escritorio de la caja física y el servidor.

| Estado | Significado Técnico | Acciones Recomendadas |
| :--- | :--- | :--- |
| **Grabando** (`grabando`) | El agente en Windows está capturando activamente el micrófono y guardando el bloque de audio actual. | Operación normal. |
| **En Espera** (`esperando`) | El agente está activo y conectado, pero se encuentra fuera del rango de turnos o aguardando inicio. | Ninguna acción requerida si está fuera del horario de atención. |
| **Pausado** (`pausado` / `en_pausa`) | La grabación fue pausada manualmente por motivos de privacidad autorizados. | Verificar con el cajero si la pausa fue justificada y reanudar al reiniciar atención. |
| **Apagado / Desconectado** (`apagado`) | El servidor no ha recibido latidos (*heartbeat*) del agente en los últimos minutos. | Verificar que la computadora de la caja esté encendida, con conexión de red y con el programa `CajaRecorderAgent` en ejecución. |

---

### 2.3 Estado de Uso y Asignación de Cajero (`en_uso`)
Determina si un cajero humano ha abierto su sesión en el puesto.

* **Libre (`en_uso = false`):** La caja física no tiene un cajero autenticado. No se asocian atenciones a ninguna persona en particular.
* **En Uso (`en_uso = true`):** El cajero ha iniciado sesión con sus credenciales en el agente. Todos los audios y atenciones generados en ese lapso se vinculan directamente al perfil del cajero (`contacto_id`) para su auditoría y cálculo de calificación.

---

### 2.4 Estado de Buffer de Diálogo en Tiempo Real
Registrado en la tabla `estado_buffer_cajas` para el seguimiento dinámico de atenciones:

* **`ESPERANDO_CLIENTE`:** El micrófono registra silencio o ruido ambiental de fondo sin interacción comercial.
* **`EN_ATENCION`:** Se detectó diálogo interactivo entre cliente y cajero. El sistema acumula los fragmentos acústicos hasta que concluye la venta para evaluar la atención completa.

---

## 3. Ciclo de Vida de Grabaciones y Atenciones

### 3.1 Pipeline de Procesamiento de Audio
Cada bloque de audio grabado por la caja recorre las siguientes etapas:

```
[ INCOMING ] ──► [ ENHANCING ] ──► [ TRANSCRIBING ] ──► [ EXTRACTING ] ──► [ ANALYZED ]
   (Subido)       (DSP Denoise)      (WhisperX + GPU)      (LLM Divide)       (Evaluado)
```

1. **`INCOMING`:** El archivo WAV de 10 a 20 minutos fue recibido por el servidor y encolado en `enhance`.
2. **`ENHANCING`:** El worker aplica ecualización de voz y reducción de ruido de fondo, generando los archivos `_ENH.wav` y `_DIAR.wav`.
3. **`TRANSCRIBING`:** WhisperX transcribe el audio en texto con marcas de tiempo exactas por palabra y Pyannote clasifica los interlocutores (`SPEAKER_00`, `SPEAKER_01`).
4. **`EXTRACTING`:** El modelo de lenguaje analiza el diálogo completo de la sesión y lo segmenta en atenciones comerciales individuales.
5. **`ANALYZED`:** Las atenciones fueron extraídas y evaluadas exitosamente contra las métricas configuradas.
6. **`FAILED_EXTRACT` / `FAILED`:** Si ocurrió un problema irrecuperable. *(El nuevo sistema cuenta con atención consolidada de respaldo para evitar estados huérfanos)*.

---

### 3.2 Estados de una Atención al Cliente

En la vista de **Atenciones al Cliente**, cada fila representa una interacción con un cliente y cuenta con dos indicadores de estado:

#### A) Estado de la Interacción (`estado`)
* **Completada (`COMPLETADA` - Etiqueta Verde):** La atención concluyó naturalmente (despedida, entrega de cambio, emisión de ticket/factura).
* **En Proceso (`EN_PROCESO` - Etiqueta Amarilla):** La atención inició justo antes del cierre del bloque de grabación y continúa en el bloque siguiente, o fue interrumpida.

#### B) Estado del Análisis de Calidad
* **Con Análisis (Calificación 0–100%):** La IA procesó la transcripción, evaluó cada pregunta del catálogo habilitado y redactó el Resumen Ejecutivo. Al hacer clic se despliega el informe completo.
* **Pendiente (Ícono Reloj de Arena):** La atención fue registrada pero su evaluación de métricas está pendiente de ser procesada por el worker de análisis.

---

## 4. Manual de Operación: Panel Web de Administración

### 4.1 Gestión de Cajas y Sucursales

#### Alta de una Nueva Caja
1. Ingresa a la pestaña **Cajas** en el menú superior.
2. Haz clic en **Nueva Caja**.
3. Diligencia los campos:
   - **Identificador:** Código único (ej. `Caja01`, `Caja_Principal`).
   - **Ubicación:** Descripción física (ej. *Ventanilla 1 - Planta Baja*).
   - **Sucursal:** Selecciona la sucursal correspondiente.
   - **Estado Operativo:** Elige `Operativa` (por defecto).
   - **Horario de Turnos:** Define la hora de inicio y fin de turno mañana y tarde.
4. Presiona **Guardar**.

#### Poner una Caja en Mantenimiento
1. En la tarjeta de la caja deseada, haz clic en **Editar**.
2. En **Estado Operativo**, cambia la opción a **En Mantenimiento**.
3. En el campo **Motivo o Factor**, describe la causa (ej. *"Micrófono con falso contacto, reemplazando conector"*).
4. Guarda los cambios. El indicador cambiará a color amarillo y se registrará en el historial de auditoría.

---

### 4.2 Configuración y CRUD de Métricas con IA

El sistema permite configurar qué criterios de calidad evalúa la Inteligencia Artificial.

#### Crear una Categoría de Evaluación
1. Ve a la pestaña **Métricas**.
2. Haz clic en **Nueva Categoría**.
3. Ingresa el nombre (ej. *"Protocolo de Saludo y Despedida"*, *"Técnicas de Venta"*).
4. Guarda. La categoría aparecerá en la lista.

#### Agregar Preguntas a una Categoría
1. Despliega la categoría creada y haz clic en **Agregar Pregunta**.
2. Define:
   - **Texto de la Pregunta:** (ej. *¿El cajero saludó cordialmente al cliente al iniciar la atención?*).
   - **Tipo de Respuesta:** `BOOLEANO` (Sí/No) o `ESCALA_NUMERICA` (1 a 5).
   - **Instrucción para la IA:** Criterio semántico de evaluación.
3. Haz clic en **Guardar Pregunta**.

#### Habilitar o Deshabilitar Métricas (Interruptor ON/OFF)
* Cada categoría y cada pregunta cuenta con un **interruptor (toggle)**:
  - **Activada (Azul):** El LLM evaluará esta métrica en todas las grabaciones entrantes.
  - **Desactivada (Gris):** El LLM **omitirá por completo** esta métrica, ahorrando tiempo de procesamiento y tokens de API.

#### Eliminar Preguntas o Categorías (Eliminación en Cascada)
* Para eliminar una pregunta o categoría, presiona el botón **Eliminar** (ícono de papelera).
* El sistema eliminará de forma segura las referencias dependientes en cascada y actualizará la interfaz al instante.

---

### 4.3 Análisis y Auditoría de Cajeros

1. Accede a **Análisis de Cajeros**.
2. Selecciona el cajero deseado de la lista para ver su panel de atención.
3. Utiliza los filtros temporales:
   - **Periodo:** `Todo`, `Hoy`, `Semana`, `Mes`.
   - **Selector de Fecha:** Filtro por día específico (`dd/mm/aaaa`).
   - **Filtro de Estado:** `Todos`, `Completadas`, `En Proceso`.
   - **Filtro de Análisis:** `Todos`, `Con Análisis`, `Pendientes`.
4. Al hacer clic sobre cualquier atención evaluada, se abrirá el modal con:
   - **Resumen Ejecutivo de 3 Párrafos:**
     1. *Calidad del Audio y Transcripción:* Claridad de palabras captadas, ruidos de fondo detectados y partes inaudibles.
     2. *Atención Comercial y Trato:* Productos solicitados, precios, formas de pago, comprobantes y actitud.
     3. *Alertas y Conclusión:* Omisiones de protocolo, promociones omitidas y recomendación de calidad.
   - **Desglose de Preguntas:** Cumplimiento (Sí/No) y justificación de la IA para cada métrica.
   - **Transcripción con Interlocutores:** Diálogo completo distinguiendo entre `Cajero` y `Cliente/Usuario`.

---

### 4.4 Reporte de Costos de Tokens

El sistema registra el consumo de tokens y costos en dólares de cada solicitud realizada a OpenAI o Groq:
1. En el encabezado del panel administrativo, haz clic en el botón **Reporte de Costos**.
2. Podrás visualizar:
   - Costo acumulado en USD.
   - Desglose por modelo (`gpt-4o-mini`, `groq`).
   - Registro cronológico de consumo por grabación y atención.

---

## 5. Manual del Agente de Escritorio (Windows)

El agente `CajaRecorderAgent` corre como una aplicación en la PC del cajero:

1. **Inicio de Turno:**
   - Abre la aplicación en el escritorio.
   - Ingresa con tu usuario y contraseña asignados.
   - Selecciona el puesto de caja asignado (ej. `Caja01`).
   - El agente verificará el micrófono y mostrará el indicador en color verde **Grabando**.
2. **Durante el Turno:**
   - La aplicación corre minimizada en la bandeja del sistema (*system tray*).
   - No requiere interacción manual durante las ventas.
3. **Cierre de Turno:**
   - Haz clic derecho sobre el ícono del agente en la barra de tareas.
   - Selecciona **Cerrar Sesión / Salir**.
   - El terminal pasará a estado `Libre` y esperará al siguiente cajero.

---

## 6. Mantenimiento y Solución de Problemas (Troubleshooting)

### A) Verificación del Estado de las Colas
Para consultar en tiempo real el estado de las tareas de procesamiento, ejecuta en el servidor:
```bash
docker compose exec api python monitor_queues.py
```
Salida esperada:
* `enhance`: `En Cola = 0`, `Activos = 0 o 1`
* `whisperx`: `En Cola = 0`, `Activos = 0 o 1`
* `analysis`: `En Cola = 0`, `Activos = 0 o 1`

### B) Reencolar Atenciones Pendientes o Fallidas
Si por alguna desconexión o fallo previo existen atenciones con análisis en estado **Pendiente**, ejecuta el script automatizado:
```bash
docker compose exec api python requeue_analysis.py
```
Este comando reintentará automáticamente los trabajos fallidos y enviará a evaluar todas las atenciones que no tengan reporte generado.

### C) Comandos Útiles de Docker Compose
* **Actualizar a la última versión:**
  ```bash
  docker compose pull api worker_analysis
  docker compose up -d api worker_analysis
  ```
* **Ver logs del worker de transcripción (WhisperX GPU):**
  ```bash
  docker compose logs -f worker_whisperx
  ```
* **Ver logs del worker de análisis (LLM):**
  ```bash
  docker compose logs -f worker_analysis
  ```
* **Reiniciar todo el ecosistema:**
  ```bash
  docker compose restart
  ```
