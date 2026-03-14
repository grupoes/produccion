<?php

namespace App\Controllers;

class Permisos extends BaseController
{
    public function index(): string
    {
        return view('permisos/index');
    }

    public function listaRoles()
    {
        $ruta = getenv('URL_BACKEND') . 'permisos/lista-roles';

        $client = \Config\Services::curlrequest();

        $response = $client->get($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['message']['error']
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message'],
            'result' => $data['result']
        ]);
    }

    public function getPermisos($idperfil)
    {
        $ruta = getenv('URL_BACKEND') . 'permisos/permisos-modulos/' . $idperfil;

        $client = \Config\Services::curlrequest();

        $response = $client->get($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['message']['error']
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message'],
            'result' => $data['result']
        ]);
    }
}
