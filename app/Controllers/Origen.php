<?php

namespace App\Controllers;

class origen extends BaseController
{
    public function index()
    {
        /*if (!session()->get('isLoggedIn')) {
            return redirect()->to(base_url());
        }*/

        return view('origen/index');
    }

    public function getOrigenes()
    {
        $ruta = getenv('URL_BACKEND') . 'origen/get-all';

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

    public function create()
    {
        $id = $this->request->getPost('id');
        $nombre = $this->request->getPost('nombre');

        $ruta = getenv('URL_BACKEND') . 'origen/save';

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
        $ruta = getenv('URL_BACKEND') . 'origen/delete/' . $id;

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
