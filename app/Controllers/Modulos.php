<?php

namespace App\Controllers;

class Modulos extends BaseController
{
    public function index()
    {
        if (!session()->get('isLoggedIn')) {
            return redirect()->to(base_url());
        }

        return view('modulos/index');
    }

    public function getAll()
    {
        $ruta = getenv('URL_BACKEND') . 'modulos/get-all';

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
                'message' => $data['messages']['error']
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message'],
            'result' => $data['result']
        ]);
    }

    public function getPrincipales()
    {
        $db = \Config\Database::connect();
        $result = $db->table('modulos')
                    ->where('id_padre', 0)
                    ->orderBy('orden', 'ASC')
                    ->get()
                    ->getResult();

        return $this->response->setJSON([
            'status' => 'success',
            'result' => $result
        ]);
    }

    public function save()
    {
        $moduloId = $this->request->getPost('moduloId');
        $moduloNombre = $this->request->getPost('moduloNombre');
        $moduloUrl = $this->request->getPost('moduloUrl');
        $moduloIcono = $this->request->getPost('moduloIcono');
        $moduloIdPadre = $this->request->getPost('moduloIdPadre');
        $orden = $this->request->getPost('orden');

        $ruta = getenv('URL_BACKEND') . 'modulos/save';

        $client = \Config\Services::curlrequest();

        $response = $client->post($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false,
            'json' => [
                'id' => $moduloId,
                'nombre' => $moduloNombre,
                'url' => $moduloUrl,
                'icono' => $moduloIcono,
                'id_padre' => $moduloIdPadre,
                'orden' => $orden
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
        $db = \Config\Database::connect();
        $db->table('modulos')->where('id', $id)->delete();

        return $this->response->setJSON(['status' => 'success']);
    }

    public function getPadres()
    {
        $ruta = getenv('URL_BACKEND') . 'modulos/get-padres';

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