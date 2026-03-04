<?php

namespace App\Controllers;

class Clientes extends BaseController
{
    public function potenciales()
    {
        return view('clientes/potenciales');
    }

    public function getTareaByRol($id)
    {
        $ruta = getenv('URL_BACKEND') . 'tareas/get-by-rol/' . $id;

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

    public function saveProspecto()
    {
        $prospecto_id = $this->request->getPost('prospecto_id');
        $nivelAcademico = $this->request->getPost('nivelAcademico');
        $universidad = $this->request->getPost('universidad');
        $carrera = $this->request->getPost('carrera');
        $fechaEntrega = $this->request->getPost('fechaEntrega');
        $nombres = $this->request->getPost('nombres');
        $apellidos = $this->request->getPost('apellidos');
        $celular = $this->request->getPost('celular');
        $tareaRealizar = $this->request->getPost('tareaRealizar');
        $personal = $this->request->getPost('personal');
        $contenido = $this->request->getPost('contenido');
        $linkDrive = $this->request->getPost('linkDrive');
        $prioridad = $this->request->getPost('prioridad');

        $usuario_id = session()->get('id_user');

        $ruta = getenv('URL_BACKEND') . 'prospectos/crear';

        $client = \Config\Services::curlrequest();

        $response = $client->post($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false,
            'json' => [
                'id' => $prospecto_id,
                'origenId' => 1,
                'nivelAcademicoId' => $nivelAcademico,
                'usuarioVentaId' => $usuario_id,
                'carreraId' => $carrera,
                'tarea_id' => $tareaRealizar,
                'personal_id' => $personal,
                'fechaEntrega' => $fechaEntrega,
                'nombres' => $nombres,
                'apellidos' => $apellidos,
                'celular' => $celular,
                'contenido' => $contenido,
                'linkDrive' => $linkDrive,
                'prioridad' => $prioridad
            ]
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['messages']['error'],
                'result' => $data['result'] ?? null
            ]);
        }

        if (!$data || $data['status'] == 400) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['messages'],
                'result' => $data['result']
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message'],
            'result' => $data['result']
        ]);
    }
}
