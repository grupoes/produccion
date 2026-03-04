<?php

namespace App\Controllers;

class Actividades extends BaseController
{

    public function getActividades()
    {
        $user = session()->get('id_user');

        $ruta = getenv('URL_BACKEND') . 'actividades/' . $user;

        $client = \Config\Services::curlrequest();

        $response = $client->get($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500 || $data['status'] == 400) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['messages']['error']
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message'],
            'result' => $data['result']
        ]);
    }

    public function getActividadRow($id)
    {

        $ruta = getenv('URL_BACKEND') . 'actividad/get-row/' . $id;

        $client = \Config\Services::curlrequest();

        $response = $client->get($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500 || $data['status'] == 400) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['messages']['error']
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message'],
            'result' => $data['result']
        ]);
    }

    public function updateLinkDrive()
    {

        $id_actividad = $this->request->getPost('id_actividad');
        $id_prospecto = $this->request->getPost('id_prospecto');
        $link_drive = $this->request->getPost('dt-link-drive');

        $ruta = getenv('URL_BACKEND') . 'actividad/update-link-drive';

        $client = \Config\Services::curlrequest();

        $response = $client->post($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false,
            'json' => [
                'id_actividad' => $id_actividad,
                'id_prospecto' => $id_prospecto,
                'link_drive' => $link_drive,
                'usuario' => session()->get('id_user')
            ]
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500 || $data['status'] == 400) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['messages']['error']
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message'],
            'result' => $data['result']
        ]);
    }

    public function delete($id)
    {
        $ruta = getenv('URL_BACKEND') . 'carreras/eliminar/' . $id;

        $client = \Config\Services::curlrequest();

        $response = $client->get($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500 || $data['status'] == 400) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['messages']['error']
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message']
        ]);
    }

    public function getEstadosActividades()
    {
        $fecha_inicio = $this->request->getPost('fecha_inicio');
        $fecha_fin = $this->request->getPost('fecha_fin');
        $estado_progreso = $this->request->getPost('estado_progreso');

        $ruta = getenv('URL_BACKEND') . 'actividad/get-estados-actividades';

        $client = \Config\Services::curlrequest();

        $response = $client->post($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false,
            'json' => [
                'fecha_inicio' => $fecha_inicio,
                'fecha_fin' => $fecha_fin,
                'estado_progreso' => $estado_progreso,
                'id' => session()->get('id_user')
            ]
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500 || $data['status'] == 400) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['messages']['error']
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message'],
            'result' => $data['result']
        ]);
    }

    public function updateEstadoTarea()
    {
        $id_actividad = $this->request->getPost('id_actividad');
        $id_prospecto = $this->request->getPost('id_prospecto');
        $estado_progreso = $this->request->getPost('estado_progreso');

        $ruta = getenv('URL_BACKEND') . 'actividad/update-estado';

        $client = \Config\Services::curlrequest();

        $response = $client->post($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false,
            'json' => [
                'id_actividad' => $id_actividad,
                'id_prospecto' => $id_prospecto,
                'estado_progreso' => $estado_progreso,
                'usuario_id' => session()->get('id_user')
            ]
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500 || $data['status'] == 400) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['messages']['error']
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message'],
            'result' => $data['result']
        ]);
    }
}
