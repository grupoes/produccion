<?php

namespace App\Controllers;

class Acciones extends BaseController
{
    public function index()
    {
        if (!session()->get('isLoggedIn')) {
            return redirect()->to(base_url());
        }

        return view('acciones/index');
    }

    public function configuracion()
    {
        if (!session()->get('isLoggedIn')) {
            return redirect()->to(base_url());
        }

        return view('acciones/configuracion');
    }

    public function getAll()
    {
        $ruta = getenv('URL_BACKEND') . 'acciones/get-all';

        $client = \Config\Services::curlrequest();

        $response = $client->get($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false,
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500 || $data['status'] == 400) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['messages']['error'] ?? 'Error al obtener acciones'
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message'] ?? '',
            'result' => $data['result'] ?? []
        ]);
    }

    public function save()
    {
        $id = $this->request->getPost('id');
        $nombre = $this->request->getPost('nombre');

        $ruta = getenv('URL_BACKEND') . 'acciones/save';

        $client = \Config\Services::curlrequest();

        $response = $client->post($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false,
            'json' => [
                'id' => $id,
                'nombre' => $nombre
            ]
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500 || $data['status'] == 400) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['messages']['error'] ?? 'Error al guardar acción'
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message'] ?? 'Acción guardada correctamente',
            'result' => $data['result'] ?? []
        ]);
    }

    public function delete($id)
    {
        $ruta = getenv('URL_BACKEND') . 'acciones/delete/' . $id;

        $client = \Config\Services::curlrequest();

        $response = $client->get($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false,
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500 || $data['status'] == 400) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['messages']['error'] ?? 'Error al eliminar acción'
            ]);
        }

        return $this->response->setJSON(['status' => 'success']);
    }

    public function saveConfig()
    {
        try {
            $id = $this->request->getPost('id');
            $acciones = $this->request->getPost('acciones');

            $ruta = getenv('URL_BACKEND') . 'acciones/save-config';

            $client = \Config\Services::curlrequest();

            $response = $client->post($ruta, [
                'headers' => [
                    'Accept' => 'application/json'
                ],
                'http_errors' => false,
                'json' => [
                    'acciones' => $acciones,
                    'id_modulo' => $id
                ]
            ]);

            $data = json_decode($response->getBody(), true);

            if (!$data || !isset($data['status']) || (int)$data['status'] >= 400) {
                $errorMsg = 'Error al guardar configuración';
                if (isset($data['messages']['error'])) {
                    $errorMsg = $data['messages']['error'];
                } elseif (isset($data['message'])) {
                    $errorMsg = $data['message'];
                } elseif (isset($data['error'])) {
                    $errorMsg = $data['error'];
                }

                return $this->response->setJSON([
                    'status' => 'error',
                    'message' => $errorMsg
                ]);
            }

            return $this->response->setJSON([
                'status' => 'success',
                'message' => $data['message'] ?? 'Configuración guardada correctamente',
                'result' => $data['result'] ?? []
            ]);
        } catch (\Exception $e) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $e->getMessage()
            ]);
        }
    }

    public function getActionsByModule($id)
    {
        $ruta = getenv('URL_BACKEND') . 'acciones/get-by-modulo/' . $id;

        $client = \Config\Services::curlrequest();

        $response = $client->get($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false,
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500 || $data['status'] == 400) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['messages']['error'] ?? 'Error al obtener acciones'
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message'] ?? '',
            'result' => $data['result'] ?? []
        ]);
    }
}