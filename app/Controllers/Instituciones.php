<?php

namespace App\Controllers;

class Instituciones extends BaseController
{
    public function index()
    {
        if (!session()->get('isLoggedIn')) {
            return redirect()->to(base_url());
        }

        return view('instituciones/index');
    }

    public function getInstituciones()
    {
        $ruta = getenv('URL_BACKEND') . 'instituciones';

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

    public function save()
    {
        $institucionId = $this->request->getPost('institucionId');
        $institucionTipo = $this->request->getPost('institucionTipo');
        $institucionNombre = $this->request->getPost('institucionNombre');
        $institucionSigla = $this->request->getPost('institucionSigla');
        $institucionSector = $this->request->getPost('institucionSector');

        $ruta = getenv('URL_BACKEND') . 'instituciones/guardar';

        $client = \Config\Services::curlrequest();

        $response = $client->post($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false,
            'json' => [
                'id' => $institucionId,
                'tipo' => $institucionTipo,
                'nombre' => $institucionNombre,
                'abreviatura' => $institucionSigla,
                'sector' => $institucionSector
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
        $ruta = getenv('URL_BACKEND') . 'instituciones/eliminar/' . $id;

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
}
