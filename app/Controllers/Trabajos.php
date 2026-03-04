<?php

namespace App\Controllers;

class Trabajos extends BaseController
{
    public function index(): string
    {
        return view('trabajos/index');
    }

    public function data()
    {
        $db = \Config\Database::connect();

        // If there's a trabajos table, attempt a basic select
        if ($db->tableExists('trabajos')) {
            $builder = $db->table('trabajos');
            // try to select common fields; if columns differ, return all
            $cols = ['id', 'titulo', 'tipo', 'fecha_inicio', 'fecha_entrega'];
            $available = [];
            $fields = $db->getFieldNames('trabajos');
            foreach ($cols as $c) {
                if (in_array($c, $fields)) $available[] = $c;
            }

            if (!empty($available)) {
                $builder->select(implode(',', $available));
            }

            $rows = $builder->limit(200)->get()->getResultArray();

            // Map rows into the standard shape expected by frontend
            $data = array_map(function ($r) {
                return [
                    'id' => $r['id'] ?? null,
                    'titulo' => $r['titulo'] ?? ($r['name'] ?? 'Sin título'),
                    'tipo' => $r['tipo'] ?? 'N/A',
                    'fecha_inicio' => $r['fecha_inicio'] ?? ($r['created_at'] ?? null),
                    'fecha_entrega' => $r['fecha_entrega'] ?? null,
                    'contactos' => [],
                    'auxiliares' => [],
                ];
            }, $rows);

            return $this->response->setJSON(['success' => true, 'data' => $data]);
        }

        // Fallback: example data for UI until real model/schema is provided
        $sample = [
            [
                'id' => 1,
                'titulo' => 'Análisis Económico de Mercado',
                'tipo' => 'Tesis',
                'fecha_inicio' => '2026-02-01',
                'fecha_entrega' => '2026-03-10',
                'contactos' => ['Elvis Bravo Sandoval', 'María González López'],
                'auxiliares' => ['Aux. Juan Pérez', 'Aux. Carla Ruiz'],
            ],
            [
                'id' => 2,
                'titulo' => 'Proyecto de Ingeniería de Sistemas',
                'tipo' => 'Proyecto',
                'fecha_inicio' => '2026-01-20',
                'fecha_entrega' => '2026-04-01',
                'contactos' => ['Carlos Rodríguez Martínez'],
                'auxiliares' => ['Aux. Luis Gómez'],
            ],
        ];

        return $this->response->setJSON(['success' => true, 'data' => $sample]);
    }

    public function sugerirAuxiliares()
    {
        $disponibilidadService = new \App\Services\DisponibilidadService();

        $cantidad = $this->request->getGet('cantidad') ?? 5;
        $trabajo_id = $this->request->getGet('trabajo_id');

        $disponibles = $disponibilidadService->obtenerMasDisponibles((int)$cantidad);

        return $this->response->setJSON([
            'success' => true,
            'data' => $disponibles,
            'trabajo_id' => $trabajo_id,
        ]);
    }

    public function reporteDisponibilidad()
    {
        $disponibilidadService = new \App\Services\DisponibilidadService();
        $reporte = $disponibilidadService->reporteDisponibilidad();

        return $this->response->setJSON(['success' => true, 'reporte' => $reporte]);
    }
}
