<!DOCTYPE html>
<html lang="es">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Scheduling Analyzer</title>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #07090f;
            --surface: #0e1117;
            --surface2: #151b26;
            --border: #1e2a3a;
            --text: #c8d6e8;
            --text-dim: #4a5f78;
            --text-muted: #2a3a50;
            --alta: #f04a4a;
            --alta-dim: rgba(240, 74, 74, 0.15);
            --media: #f0a030;
            --media-dim: rgba(240, 160, 48, 0.15);
            --baja: #30c070;
            --baja-dim: rgba(48, 192, 112, 0.15);
            --urgent: #3b9eff;
            --urgent-dim: rgba(59, 158, 255, 0.12);
            --green: #30c070;
            --yellow: #f0a030;
            --red: #f04a4a;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            background: var(--bg);
            color: var(--text);
            font-family: 'IBM Plex Sans', sans-serif;
            font-size: 14px;
            min-height: 100vh;
            padding: 32px 24px;
        }

        /* Grid noise overlay */
        body::before {
            content: '';
            position: fixed;
            inset: 0;
            background-image:
                linear-gradient(rgba(30, 42, 58, 0.3) 1px, transparent 1px),
                linear-gradient(90deg, rgba(30, 42, 58, 0.3) 1px, transparent 1px);
            background-size: 40px 40px;
            pointer-events: none;
            z-index: 0;
        }

        .wrap {
            position: relative;
            z-index: 1;
            max-width: 1100px;
            margin: 0 auto;
        }

        /* Header */
        .header {
            margin-bottom: 28px;
        }

        .header-tag {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-family: 'IBM Plex Mono', monospace;
            font-size: 10px;
            letter-spacing: 3px;
            color: var(--red);
            margin-bottom: 10px;
        }

        .header-tag::before {
            content: '';
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--red);
            box-shadow: 0 0 10px var(--red);
            animation: pulse 1.4s ease-in-out infinite;
        }

        @keyframes pulse {

            0%,
            100% {
                opacity: 1;
            }

            50% {
                opacity: 0.3;
            }
        }

        h1 {
            font-family: 'IBM Plex Mono', monospace;
            font-size: 26px;
            font-weight: 700;
            color: #e8f0fa;
            letter-spacing: -1px;
            margin-bottom: 16px;
        }

        /* Urgent card */
        .urgent-card {
            display: inline-flex;
            align-items: center;
            gap: 14px;
            background: rgba(240, 74, 74, 0.07);
            border: 1px solid rgba(240, 74, 74, 0.3);
            border-radius: 8px;
            padding: 10px 18px;
            font-family: 'IBM Plex Mono', monospace;
            font-size: 12px;
        }

        .urgent-card .label {
            color: #f8a0a0;
            font-weight: 600;
        }

        .urgent-card .sep {
            color: var(--border);
        }

        .urgent-card .val {
            color: var(--red);
        }

        /* Legend */
        .legend {
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
            margin: 20px 0 24px;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 7px;
            font-size: 11px;
            color: var(--text-dim);
        }

        .legend-dot {
            width: 11px;
            height: 11px;
            border-radius: 3px;
        }

        /* Hour axis */
        .hour-axis {
            display: flex;
            margin-left: 148px;
            margin-bottom: 6px;
            font-family: 'IBM Plex Mono', monospace;
            font-size: 10px;
            color: var(--text-muted);
        }

        .hour-tick {
            flex: 1;
            text-align: left;
        }

        .hour-tick:last-child {
            flex: 0;
            min-width: 28px;
        }

        /* Worker row */
        .worker-row {
            display: flex;
            align-items: center;
            margin-bottom: 5px;
            padding: 5px 8px;
            border-radius: 8px;
            border: 1px solid transparent;
            cursor: pointer;
            transition: background 0.15s, border-color 0.15s;
        }

        .worker-row:hover {
            background: var(--surface);
            border-color: var(--border);
        }

        .worker-row.selected {
            background: var(--surface2);
            border-color: #2a3a50;
        }

        .worker-info {
            width: 140px;
            flex-shrink: 0;
            margin-right: 8px;
        }

        .worker-name {
            font-size: 12px;
            font-weight: 600;
            color: #a0b8d0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .worker-status {
            font-size: 10px;
            font-family: 'IBM Plex Mono', monospace;
            margin-top: 2px;
        }

        .status-free {
            color: var(--green);
        }

        .status-move {
            color: var(--yellow);
        }

        .status-no {
            color: var(--red);
        }

        /* Timeline */
        .timeline {
            flex: 1;
            height: 38px;
            position: relative;
            background: var(--surface);
            border-radius: 6px;
            overflow: hidden;
        }

        /* Hour grid lines inside timeline */
        .timeline-grid {
            position: absolute;
            inset: 0;
            display: flex;
            pointer-events: none;
        }

        .timeline-grid-col {
            flex: 1;
            border-right: 1px solid rgba(30, 42, 58, 0.8);
        }

        .act-block {
            position: absolute;
            top: 3px;
            bottom: 3px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            overflow: hidden;
            padding: 0 5px;
            font-size: 9px;
            font-weight: 600;
            white-space: nowrap;
            cursor: default;
            transition: opacity 0.2s;
        }

        .act-block.moving {
            opacity: 0.35;
            background: transparent !important;
            border: 1.5px dashed;
        }

        .act-alta {
            background: var(--alta);
            color: #fff;
        }

        .act-media {
            background: var(--media);
            color: #1a0e00;
        }

        .act-baja {
            background: var(--baja);
            color: #001a0a;
        }

        .urgent-slot {
            position: absolute;
            top: 0;
            bottom: 0;
            background: var(--urgent-dim);
            border: 1.5px dashed var(--urgent);
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 9px;
            font-family: 'IBM Plex Mono', monospace;
            color: var(--urgent);
            font-weight: 700;
            letter-spacing: 1px;
            z-index: 10;
        }

        /* Analysis panel */
        .analysis-btn {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 14px 18px;
            cursor: pointer;
            width: 100%;
            margin-top: 24px;
            font-family: 'IBM Plex Mono', monospace;
            transition: border-color 0.15s;
        }

        .analysis-btn:hover {
            border-color: #2a3a50;
        }

        .analysis-btn-title {
            font-size: 11px;
            color: var(--text-dim);
            letter-spacing: 2px;
        }

        .analysis-btn-toggle {
            font-size: 11px;
            color: var(--text-muted);
        }

        .stats-row {
            display: flex;
            gap: 32px;
            margin-top: 14px;
        }

        .stat-item {
            text-align: center;
        }

        .stat-num {
            font-size: 30px;
            font-weight: 700;
            font-family: 'IBM Plex Mono', monospace;
        }

        .stat-lbl {
            font-size: 10px;
            color: var(--text-dim);
            margin-top: 2px;
        }

        .analysis-panel {
            background: var(--surface);
            border: 1px solid var(--border);
            border-top: none;
            border-radius: 0 0 10px 10px;
            padding: 18px 20px;
            display: none;
        }

        .analysis-panel.open {
            display: block;
        }

        .section-label {
            font-family: 'IBM Plex Mono', monospace;
            font-size: 10px;
            letter-spacing: 2px;
            margin-bottom: 8px;
            margin-top: 16px;
        }

        .section-label:first-child {
            margin-top: 0;
        }

        .analysis-row {
            font-size: 12px;
            color: #6a8aa8;
            margin-bottom: 5px;
            padding-left: 10px;
        }

        .analysis-row strong {
            color: var(--text);
        }

        .recomendacion {
            margin-top: 18px;
            padding-top: 16px;
            border-top: 1px solid var(--border);
            font-size: 13px;
        }

        .rec-label {
            font-family: 'IBM Plex Mono', monospace;
            font-size: 10px;
            letter-spacing: 2px;
            color: var(--urgent);
            margin-bottom: 8px;
        }

        /* Tooltip */
        .tooltip {
            position: fixed;
            z-index: 1000;
            background: #0a1020;
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 8px 12px;
            font-family: 'IBM Plex Mono', monospace;
            font-size: 11px;
            color: var(--text);
            pointer-events: none;
            display: none;
            white-space: nowrap;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        }

        .footer {
            margin-top: 20px;
            text-align: center;
            font-size: 10px;
            color: var(--text-muted);
            font-family: 'IBM Plex Mono', monospace;
        }

        /* Input section */
        .input-panel {
            display: flex;
            gap: 16px;
            background: var(--surface);
            border: 1px solid var(--border);
            padding: 16px;
            border-radius: 12px;
            align-items: flex-end;
            margin-bottom: 24px;
        }

        .input-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
            flex: 1;
        }

        .input-group label {
            font-size: 10px;
            font-family: 'IBM Plex Mono', monospace;
            color: var(--text-dim);
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .input-group input, .input-group select {
            background: var(--bg);
            border: 1px solid var(--border);
            color: var(--text);
            padding: 8px 12px;
            border-radius: 6px;
            font-family: 'IBM Plex Sans', sans-serif;
            font-size: 13px;
            outline: none;
        }

        .input-group input:focus {
            border-color: var(--urgent);
        }

        .run-btn {
            background: var(--urgent);
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            font-weight: 700;
            font-family: 'IBM Plex Mono', monospace;
            font-size: 11px;
            cursor: pointer;
            transition: opacity 0.2s;
            height: 38px;
        }

        .run-btn:hover {
            opacity: 0.9;
        }

        /* Selected worker task list */
        .worker-tasks-list {
            background: rgba(30, 42, 58, 0.2);
            margin: -5px 8px 12px 148px;
            padding: 16px;
            border-radius: 0 0 8px 8px;
            border: 1px solid #1e2a3a;
            border-top: none;
        }

        .tasks-title {
            font-size: 11px;
            font-weight: 700;
            color: var(--text-dim);
            margin-bottom: 12px;
            font-family: 'IBM Plex Mono', monospace;
        }

        .tasks-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 10px;
        }

        .task-mini-card {
            padding: 10px;
            border-radius: 6px;
            border-left: 3px solid transparent;
        }

        .task-mini-time {
            font-size: 10px;
            font-family: 'IBM Plex Mono', monospace;
            opacity: 0.8;
        }

        .task-mini-name {
            font-size: 12px;
            font-weight: 600;
            margin: 4px 0;
        }

        .task-mini-prior {
            font-size: 9px;
            font-weight: 700;
            opacity: 0.7;
        }

        .task-mini-card.act-alta { background: rgba(240, 74, 74, 0.1); border-left-color: var(--alta); }
        .task-mini-card.act-media { background: rgba(240, 160, 48, 0.1); border-left-color: var(--media); }
        .task-mini-card.act-baja { background: rgba(48, 192, 112, 0.1); border-left-color: var(--baja); }
        .assign-mini-btn {
            background: var(--green);
            color: #001a0a;
            border: none;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
            font-family: 'IBM Plex Mono', monospace;
            cursor: pointer;
            margin-left: 10px;
        }

        .assign-mini-btn:hover {
            opacity: 0.8;
        }
    </style>
</head>

<body>
    <div class="wrap">

        <!-- Header -->
        <div class="header">
            <div class="header-tag">PROGRAMACIÓN DE ACTIVIDAD DINÁMICA</div>
            <h1>Scheduling Analyzer</h1>
            
            <div class="input-panel">
                <div class="input-group">
                    <label>Nombre de Actividad</label>
                    <input type="text" id="taskName" value="Fallo crítico cliente A" placeholder="Ej: Soporte técnico">
                </div>
                <div class="input-group">
                    <label>Duración (Horas)</label>
                    <input type="number" id="taskHours" value="3" min="1" max="11">
                </div>
                <div class="input-group">
                    <label>Prioridad</label>
                    <select id="taskPriority">
                        <option value="alta" selected>Alta (No movible)</option>
                        <option value="media">Media</option>
                        <option value="baja">Baja</option>
                    </select>
                </div>
                <button class="run-btn" onclick="updateAnalysis()">Analizar Disponibilidad</button>
            </div>
        </div>

        <!-- Legend -->
        <div class="legend">
            <div class="legend-item">
                <div class="legend-dot" style="background:#f04a4a"></div>Prioridad ALTA
            </div>
            <div class="legend-item">
                <div class="legend-dot" style="background:#f0a030"></div>Prioridad MEDIA
            </div>
            <div class="legend-item">
                <div class="legend-dot" style="background:#30c070"></div>Prioridad BAJA
            </div>
            <div class="legend-item">
                <div class="legend-dot" style="background:rgba(59,158,255,0.3);border:1px dashed #3b9eff"></div>Nueva actividad
            </div>
            <div class="legend-item">
                <div class="legend-dot" style="background:transparent;border:1.5px dashed #f0a030;opacity:0.5"></div>Actividad a mover
            </div>
        </div>

        <!-- Hour axis -->
        <div class="hour-axis" id="hourAxis"></div>

        <!-- Workers timeline -->
        <div id="workers"></div>

        <!-- Analysis button + panel -->
        <div>
            <div class="analysis-btn" id="analysisBtn" onclick="toggleAnalysis()">
                <div>
                    <div class="analysis-btn-title">RESULTADO DEL ALGORITMO</div>
                    <div class="stats-row" id="statsRow"></div>
                </div>
                <div class="analysis-btn-toggle" id="toggleLabel">▼ ver detalle</div>
            </div>
            <div class="analysis-panel" id="analysisPanel"></div>
        </div>

        <div class="footer">Haz clic en un trabajador para resaltar · Pasa el cursor sobre actividades para ver detalles</div>
    </div>

    <!-- Tooltip -->
    <div class="tooltip" id="tooltip"></div>

    <script>
        const HOURS_START = 7;
        const HOURS_END = 18;
        const TOTAL_HOURS = HOURS_END - HOURS_START;

        let URGENT = {
            name: "Fallo crítico cliente A",
            hours: 3,
            priority: "alta",
            deadline: 0
        };

        const WORKERS = [{
                id: 1,
                name: "Ana Torres",
                activities: [{
                        id: 1,
                        name: "Auditoría sistema",
                        priority: "alta",
                        day: 0,
                        start: 7,
                        end: 10,
                        deadline: 0
                    },
                    {
                        id: 2,
                        name: "Config. crítica",
                        priority: "alta",
                        day: 0,
                        start: 10,
                        end: 13,
                        deadline: 0
                    },
                    {
                        id: 3,
                        name: "Informe mensual",
                        priority: "media",
                        day: 0,
                        start: 13,
                        end: 16,
                        deadline: 1
                    },
                    {
                        id: 4,
                        name: "Revisión final",
                        priority: "alta",
                        day: 0,
                        start: 16,
                        end: 18,
                        deadline: 0
                    },
                ]
            },
            {
                id: 2,
                name: "Carlos Ruiz",
                activities: [{
                        id: 5,
                        name: "Config. servidor",
                        priority: "alta",
                        day: 0,
                        start: 7,
                        end: 10,
                        deadline: 0
                    },
                    {
                        id: 6,
                        name: "Backup datos",
                        priority: "baja",
                        day: 0,
                        start: 10,
                        end: 13,
                        deadline: 2
                    },
                    {
                        id: 7,
                        name: "Monitoreo red",
                        priority: "alta",
                        day: 0,
                        start: 13,
                        end: 16,
                        deadline: 0
                    },
                    {
                        id: 8,
                        name: "Logs sistema",
                        priority: "media",
                        day: 0,
                        start: 16,
                        end: 18,
                        deadline: 1
                    },
                ]
            },
            {
                id: 3,
                name: "María López",
                activities: [{
                        id: 9,
                        name: "Reunión VIP",
                        priority: "alta",
                        day: 0,
                        start: 7,
                        end: 9,
                        deadline: 0
                    },
                    {
                        id: 10,
                        name: "Negociación contrato",
                        priority: "alta",
                        day: 0,
                        start: 9,
                        end: 12,
                        deadline: 0
                    },
                    {
                        id: 11,
                        name: "Presentación board",
                        priority: "alta",
                        day: 0,
                        start: 12,
                        end: 15,
                        deadline: 0
                    },
                    {
                        id: 12,
                        name: "Cierre acuerdo",
                        priority: "alta",
                        day: 0,
                        start: 15,
                        end: 18,
                        deadline: 0
                    },
                ]
            },
            {
                id: 4,
                name: "Luis Méndez",
                activities: [{
                        id: 13,
                        name: "Instalación red",
                        priority: "baja",
                        day: 0,
                        start: 7,
                        end: 9,
                        deadline: 2
                    },
                    {
                        id: 14,
                        name: "Soporte usuarios",
                        priority: "media",
                        day: 0,
                        start: 9,
                        end: 11,
                        deadline: 1
                    },
                    {
                        id: 15,
                        name: "Doc. técnica",
                        priority: "baja",
                        day: 0,
                        start: 11,
                        end: 12,
                        deadline: 2
                    },
                    {
                        id: 16,
                        name: "Patch servidores",
                        priority: "alta",
                        day: 0,
                        start: 12,
                        end: 15,
                        deadline: 0
                    },
                    {
                        id: 17,
                        name: "Inventario equipos",
                        priority: "baja",
                        day: 0,
                        start: 15,
                        end: 18,
                        deadline: 2
                    },
                ]
            },
            {
                id: 5,
                name: "Sofía Castro",
                activities: [{
                        id: 18,
                        name: "Mantenimiento BD",
                        priority: "alta",
                        day: 0,
                        start: 7,
                        end: 13,
                        deadline: 0
                    },
                    {
                        id: 19,
                        name: "Migración datos",
                        priority: "alta",
                        day: 0,
                        start: 13,
                        end: 16,
                        deadline: 0
                    },
                    {
                        id: 20,
                        name: "Reporte estado",
                        priority: "media",
                        day: 0,
                        start: 16,
                        end: 18,
                        deadline: 1
                    },
                ]
            },
            {
                id: 6,
                name: "Pedro Vargas",
                activities: [{
                        id: 21,
                        name: "Testing app",
                        priority: "media",
                        day: 0,
                        start: 7,
                        end: 10,
                        deadline: 1
                    },
                    {
                        id: 22,
                        name: "Deploy producción",
                        priority: "alta",
                        day: 0,
                        start: 10,
                        end: 13,
                        deadline: 0
                    },
                    {
                        id: 23,
                        name: "Hotfix urgente",
                        priority: "alta",
                        day: 0,
                        start: 13,
                        end: 16,
                        deadline: 0
                    },
                    {
                        id: 24,
                        name: "Docs API",
                        priority: "baja",
                        day: 0,
                        start: 16,
                        end: 18,
                        deadline: 2
                    },
                ]
            },
            {
                id: 7,
                name: "Laura Jiménez",
                activities: [{
                        id: 25,
                        name: "Capacitación equipo",
                        priority: "alta",
                        day: 0,
                        start: 7,
                        end: 10,
                        deadline: 0
                    },
                    {
                        id: 26,
                        name: "Encuesta interna",
                        priority: "baja",
                        day: 0,
                        start: 10,
                        end: 12,
                        deadline: 2
                    },
                    {
                        id: 27,
                        name: "Evaluaciones",
                        priority: "alta",
                        day: 0,
                        start: 12,
                        end: 15,
                        deadline: 0
                    },
                    {
                        id: 28,
                        name: "Archivo docs",
                        priority: "baja",
                        day: 0,
                        start: 15,
                        end: 18,
                        deadline: 2
                    },
                ]
            },
            {
                id: 8,
                name: "Diego Morales",
                activities: [{
                        id: 29,
                        name: "Análisis seguridad",
                        priority: "alta",
                        day: 0,
                        start: 7,
                        end: 11,
                        deadline: 0
                    },
                    {
                        id: 30,
                        name: "Pentesting",
                        priority: "alta",
                        day: 0,
                        start: 11,
                        end: 14,
                        deadline: 0
                    },
                    {
                        id: 31,
                        name: "Reporte vuln.",
                        priority: "alta",
                        day: 0,
                        start: 14,
                        end: 18,
                        deadline: 0
                    },
                ]
            },
            {
                id: 9,
                name: "Valentina Ríos",
                activities: [{
                        id: 32,
                        name: "Diseño UI sprint",
                        priority: "alta",
                        day: 0,
                        start: 7,
                        end: 11,
                        deadline: 0
                    },
                    {
                        id: 33,
                        name: "Revisión UX",
                        priority: "media",
                        day: 0,
                        start: 11,
                        end: 14,
                        deadline: 1
                    },
                    {
                        id: 34,
                        name: "Prototipo",
                        priority: "alta",
                        day: 0,
                        start: 14,
                        end: 18,
                        deadline: 0
                    },
                ]
            },
            {
                id: 10,
                name: "Roberto Soto",
                activities: [{
                        id: 35,
                        name: "Integración API",
                        priority: "alta",
                        day: 0,
                        start: 7,
                        end: 10,
                        deadline: 0
                    },
                    {
                        id: 36,
                        name: "Pruebas carga",
                        priority: "media",
                        day: 0,
                        start: 10,
                        end: 12,
                        deadline: 1
                    },
                    {
                        id: 37,
                        name: "Optimización BD",
                        priority: "alta",
                        day: 0,
                        start: 12,
                        end: 16,
                        deadline: 0
                    },
                    {
                        id: 38,
                        name: "Limpieza logs",
                        priority: "baja",
                        day: 0,
                        start: 16,
                        end: 18,
                        deadline: 2
                    },
                ]
            },
        ];

        // ── Algorithm ─────────────────────────────────────────────────────────────
        function pct(h) {
            return ((h - HOURS_START) / TOTAL_HOURS) * 100;
        }

        function freeBlocks(acts) {
            const sorted = [...acts].sort((a, b) => a.start - b.start);
            const blocks = [];
            let cur = HOURS_START;
            for (const a of sorted) {
                if (a.start > cur) blocks.push({
                    start: cur,
                    end: a.start
                });
                cur = Math.max(cur, a.end);
            }
            if (cur < HOURS_END) blocks.push({
                start: cur,
                end: HOURS_END
            });
            return blocks;
        }

        function canFit(worker, urgentHours, urgentPriority) {
            const acts = worker.activities.filter(a => a.day === 0);
            const altaActs = acts.filter(a => a.priority === 'alta');
            
            let bestSlot = null;
            let bestMoved = null;
            let minMovedHours = Infinity;

            // Buscamos una ventana de 'urgentHours' donde no haya tareas de ALTA prioridad
            for (let h = HOURS_START; h <= HOURS_END - urgentHours; h++) {
                const slotStart = h;
                const slotEnd = h + urgentHours;

                // Verificar colisión con tareas ALTA
                const overlapsAlta = altaActs.some(a => 
                    (slotStart < a.end && slotEnd > a.start)
                );

                if (!overlapsAlta) {
                    // Ventana viable. Calculamos qué tareas (Media/Baja) se verían afectadas.
                    const overlappingActs = acts.filter(a => 
                        a.priority !== 'alta' && (slotStart < a.end && slotEnd > a.start)
                    );
                    
                    const movedHours = overlappingActs.reduce((sum, a) => sum + (Math.min(slotEnd, a.end) - Math.max(slotStart, a.start)), 0);
                    
                    // Si no hay que mover nada, es un slot libre (mejor opción)
                    if (overlappingActs.length === 0) {
                        return {
                            canFit: true,
                            method: "libre",
                            slot: { start: slotStart, end: slotEnd },
                            moved: []
                        };
                    }

                    // Guardamos la mejor opción (la que afecte menos horas de trabajo actual)
                    if (movedHours < minMovedHours) {
                        minMovedHours = movedHours;
                        bestSlot = { start: slotStart, end: slotEnd };
                        bestMoved = overlappingActs;
                    }
                }
            }

            if (bestSlot) {
                return {
                    canFit: true,
                    method: "moviendo",
                    slot: bestSlot,
                    moved: bestMoved
                };
            }

            return {
                canFit: false,
                reason: "Todas las ventanas posibles colisionan con tareas de ALTA prioridad."
            };
        }

        let analysis = [];
        let isAnalyzed = false;

        function runComputation() {
            analysis = WORKERS.map(w => ({
                ...w,
                result: canFit(w, URGENT.hours, URGENT.priority)
            }));
        }

        function updateAnalysis() {
            URGENT.name = document.getElementById('taskName').value;
            URGENT.hours = parseInt(document.getElementById('taskHours').value);
            URGENT.priority = document.getElementById('taskPriority').value;

            if (isNaN(URGENT.hours) || URGENT.hours <= 0) {
                alert("Por favor ingresa una duración válida");
                return;
            }

            isAnalyzed = true;
            runComputation();
            
            // Auto-seleccionar el mejor candidato
            const best = analysis.find(w => w.result.canFit && w.result.method === 'libre') || 
                         analysis.find(w => w.result.canFit);
            if (best) selectedId = best.id;

            renderWorkers();
            renderStats();
            renderPanel();
            
            // Feedback visual
            const btn = document.querySelector('.run-btn');
            btn.textContent = "¡Analizado!";
            btn.style.background = "var(--green)";
            setTimeout(() => {
                btn.textContent = "Analizar Disponibilidad";
                btn.style.background = "var(--urgent)";
            }, 2000);
        }

        function assignTask(workerId) {
            const worker = WORKERS.find(w => w.id === workerId);
            const workerAnalysis = analysis.find(w => w.id === workerId);
            
            if (!workerAnalysis || !workerAnalysis.result.canFit) return;

            const res = workerAnalysis.result;
            const movedActivities = [...res.moved]; // Guardamos copia de las que vamos a desplazar
            
            // 1. Quitar las que colisionan
            const movedIds = new Set(movedActivities.map(m => m.id));
            worker.activities = worker.activities.filter(a => !movedIds.has(a.id));
            
            // 2. Agregar la nueva actividad en su slot asignado
            worker.activities.push({
                id: Date.now(),
                name: URGENT.name,
                priority: URGENT.priority,
                day: 0,
                start: res.slot.start,
                end: res.slot.end,
                deadline: 0
            });
            
            // 3. Re-programar las actividades movidas al final del turno actual
            // Buscamos el final de la última tarea programada para hoy
            let lastEndTime = worker.activities
                .filter(a => a.day === 0)
                .reduce((max, a) => Math.max(max, a.end), HOURS_START);

            movedActivities.forEach(act => {
                const duration = act.end - act.start;
                // Si aún cabe en el turno (antes de las 18:00)
                if (lastEndTime + duration <= HOURS_END) {
                    worker.activities.push({
                        ...act,
                        start: lastEndTime,
                        end: lastEndTime + duration
                    });
                    lastEndTime += duration;
                } else {
                    // Si no cabe, la pasamos al día siguiente (cambiando day a 1)
                    // O simplemente la dejamos marcada como pendiente para mañana
                    worker.activities.push({
                        ...act,
                        day: 1, // Mañana
                        start: HOURS_START,
                        end: HOURS_START + duration
                    });
                }
            });
            
            // 4. Resetear y re-analizar
            isAnalyzed = false; // Resetear vista de análisis tras asignar
            alert(`"${URGENT.name}" asignada. Las actividades desplazadas se han movido al final de la agenda.`);
            renderWorkers();
            renderStats();
            renderPanel();
        }

        // ── Render ─────────────────────────────────────────────────────────────────
        // Hour axis
        const axisEl = document.getElementById('hourAxis');
        for (let h = HOURS_START; h <= HOURS_END; h++) {
            const t = document.createElement('div');
            t.className = 'hour-tick';
            t.textContent = h + ':00';
            if (h === HOURS_END) t.style.flex = '0';
            axisEl.appendChild(t);
        }

        let selectedId = null;

        function renderWorkers() {
            const container = document.getElementById('workers');
            container.innerHTML = '';

            WORKERS.forEach(worker => {
                const workerAnalysis = isAnalyzed ? analysis.find(a => a.id === worker.id) : null;
                const r = workerAnalysis ? workerAnalysis.result : null;
                const acts = worker.activities.filter(a => a.day === 0);
                const movedIds = (isAnalyzed && r) ? new Set((r.moved || []).map(a => a.id)) : new Set();

                const row = document.createElement('div');
                row.className = 'worker-row' + (selectedId === worker.id ? ' selected' : '');
                row.onclick = () => {
                    selectedId = selectedId === worker.id ? null : worker.id;
                    renderWorkers();
                };

                // Info
                const info = document.createElement('div');
                info.className = 'worker-info';
                
                let statusClass = 'status-free';
                let statusText = 'Disponibilidad activa';
                
                if (isAnalyzed && r) {
                    statusClass = r.canFit ? (r.method === 'libre' ? 'status-free' : 'status-move') : 'status-no';
                    statusText = r.canFit ? (r.method === 'libre' ? '✓ slot libre' : `⚠ mover ${r.moved.length} act.`) : '✗ no puede';
                }

                info.innerHTML = `
                  <div class="worker-name">${worker.name}</div>
                  <div class="worker-status ${statusClass}">${statusText}</div>`;
                row.appendChild(info);

                // Timeline
                const tl = document.createElement('div');
                tl.className = 'timeline';

                // Grid lines
                const grid = document.createElement('div');
                grid.className = 'timeline-grid';
                for (let i = 0; i < TOTAL_HOURS; i++) {
                    const col = document.createElement('div');
                    col.className = 'timeline-grid-col';
                    grid.appendChild(col);
                }
                tl.appendChild(grid);

                // Urgent slot
                if (isAnalyzed && r && r.canFit) {
                    const us = document.createElement('div');
                    us.className = 'urgent-slot';
                    us.style.left = pct(r.slot.start) + '%';
                    us.style.width = ((URGENT.hours / TOTAL_HOURS) * 100) + '%';
                    us.textContent = URGENT.name;
                    tl.appendChild(us);
                }

                // Activity blocks
                acts.forEach(act => {
                    const isMoving = isAnalyzed && movedIds.has(act.id);
                    const block = document.createElement('div');
                    block.className = `act-block act-${act.priority}${isMoving ? ' moving' : ''}`;
                    if (isMoving) block.style.borderColor = act.priority === 'media' ? '#f0a030' : '#30c070';
                    block.style.left = pct(act.start) + '%';
                    block.style.width = (((act.end - act.start) / TOTAL_HOURS) * 100) + '%';
                    block.style.zIndex = isMoving ? 1 : 5;
                    block.textContent = isMoving ? '→ mover' : act.name;

                    // Tooltip
                    block.addEventListener('mousemove', e => {
                        const tt = document.getElementById('tooltip');
                        const deadlineLabel = ['Hoy', 'Mañana', 'Pasado'][act.deadline] || `Día ${act.deadline}`;
                        tt.innerHTML = `<b>${act.name}</b><br>${act.start}:00 – ${act.end}:00 &nbsp;·&nbsp; ${act.end-act.start}h<br>Prioridad: ${act.priority.toUpperCase()} &nbsp;·&nbsp; Deadline: ${deadlineLabel}${isMoving ? '<br><span style="color:#f0a030">→ Se puede mover al día siguiente</span>' : ''}`;
                        tt.style.display = 'block';
                        tt.style.left = (e.clientX + 14) + 'px';
                        tt.style.top = (e.clientY - 10) + 'px';
                    });
                    block.addEventListener('mouseleave', () => {
                        document.getElementById('tooltip').style.display = 'none';
                    });

                    tl.appendChild(block);
                });

                row.appendChild(tl);
                container.appendChild(row);

                // Show task list if selected
                if (selectedId === worker.id) {
                    const taskList = document.createElement('div');
                    taskList.className = 'worker-tasks-list';
                    let tasksHtml = '<div class="tasks-title">Agenda Actual de ' + worker.name + '</div>';
                    tasksHtml += '<div class="tasks-grid">';
                    acts.forEach(act => {
                        tasksHtml += `
                            <div class="task-mini-card act-${act.priority}">
                                <div class="task-mini-time">${act.start}:00 - ${act.end}:00</div>
                                <div class="task-mini-name">${act.name}</div>
                                <div class="task-mini-prior">${act.priority.toUpperCase()} ${act.priority === 'alta' ? '(No movible)' : ''}</div>
                            </div>
                        `;
                    });
                    tasksHtml += '</div>';
                    taskList.innerHTML = tasksHtml;
                    container.appendChild(taskList);
                }
            });
        }

        function renderStats() {
            if (!isAnalyzed) {
                document.getElementById('statsRow').innerHTML = `<div class="stat-lbl" style="text-align:left">Ingresa los datos arriba y pulsa analizar para ver el impacto.</div>`;
                return;
            }
            const free = analysis.filter(w => w.result.canFit && w.result.method === 'libre');
            const move = analysis.filter(w => w.result.canFit && w.result.method === 'moviendo');
            const nope = analysis.filter(w => !w.result.canFit);

            document.getElementById('statsRow').innerHTML = `
                <div class="stat-item"><div class="stat-num" style="color:#30c070">${free.length}</div><div class="stat-lbl">slot libre</div></div>
                <div class="stat-item"><div class="stat-num" style="color:#f0a030">${move.length}</div><div class="stat-lbl">moviendo acts.</div></div>
                <div class="stat-item"><div class="stat-num" style="color:#f04a4a">${nope.length}</div><div class="stat-lbl">no pueden</div></div>
            `;
        }

        // Analysis panel
        function renderPanel() {
            if (!isAnalyzed) {
                document.getElementById('analysisPanel').innerHTML = `<div class="analysis-row">Esperando análisis...</div>`;
                return;
            }
            const free = analysis.filter(w => w.result.canFit && w.result.method === 'libre');
            const move = analysis.filter(w => w.result.canFit && w.result.method === 'moviendo');
            const nope = analysis.filter(w => !w.result.canFit);

            let html = '';

            html += `<div class="section-label" style="color:#30c070">✓ PUEDEN SIN CAMBIOS (slot libre directo)</div>`;
            if (!free.length) {
                html += `<div class="analysis-row">Ninguno tiene hueco libre suficiente</div>`;
            } else {
                free.forEach(w => {
                    html += `
                        <div class="analysis-row" style="display:flex; justify-content:space-between; align-items:center;">
                            <span>→ <strong>${w.name}</strong> — slot ${w.result.slot.start}:00–${w.result.slot.end}:00</span>
                            <button class="assign-mini-btn" onclick="assignTask(${w.id})">Asignar</button>
                        </div>`;
                });
            }

            html += `<div class="section-label" style="color:#f0a030">⚠ PUEDEN MOVIENDO ACTIVIDADES</div>`;
            if (!move.length) {
                html += `<div class="analysis-row">Ninguno</div>`;
            } else {
                move.forEach(w => {
                    const moved = w.result.moved.map(m => `"${m.name}" (${m.priority})`).join(', ');
                    html += `
                        <div class="analysis-row" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                            <div style="flex:1">
                                <strong>${w.name}</strong> — mover: ${moved}<br>
                                <span style="font-size:10px; color:var(--text-muted)">Slot resultante: ${w.result.slot.start}:00–${w.result.slot.end}:00</span>
                            </div>
                            <button class="assign-mini-btn" style="background:var(--yellow); color:black;" onclick="assignTask(${w.id})">Asignar</button>
                        </div>`;
                });
            }

            html += `<div class="section-label" style="color:#f04a4a">✗ NO PUEDEN</div>`;
            nope.forEach(w => {
                html += `<div class="analysis-row">— ${w.name}: ${w.result.reason}</div>`;
            });

            // Recommendation
            const best = free[0] || move[0];
            html += `<div class="recomendacion">`;
            html += `<div class="rec-label">⭐ RECOMENDACIÓN DEL ALGORITMO</div>`;
            if (best) {
                if (best.result.method === 'libre') {
                    html += `<span style="color:#93c5fd">Asignar a <strong style="color:#e8f0fa">${best.name}</strong> — tiene slot libre y no requiere cambios en su agenda.</span>`;
                } else {
                    const sumHours = best.result.moved.reduce((s, x) => s + (x.end - x.start), 0);
                    html += `<span style="color:#fcd34d">Asignar a <strong style="color:#e8f0fa">${best.name}</strong> — es el que menos horas (solo ${sumHours}h) necesita desplazar.</span>`;
                }
            } else {
                html += `<span style="color:#f87171">Ningún trabajador tiene capacidad para esta tarea con ${URGENT.hours}h de duración.</span>`;
            }
            html += `</div>`;

            document.getElementById('analysisPanel').innerHTML = html;
        }

        function toggleAnalysis() {
            const panel = document.getElementById('analysisPanel');
            const label = document.getElementById('toggleLabel');
            const btn = document.getElementById('analysisBtn');
            const open = panel.classList.toggle('open');
            label.textContent = open ? '▲ cerrar' : '▼ ver detalle';
            btn.style.borderRadius = open ? '10px 10px 0 0' : '10px';
        }

        renderWorkers();
        renderStats();
        renderPanel();
    </script>
</body>

</html>