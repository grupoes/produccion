<?php

namespace App\Controllers;

class Feriados extends BaseController
{
    public function index()
    {
        if (!session()->get('isLoggedIn')) {
            return redirect()->to(base_url());
        }

        return view('mantenimientos/feriados');
    }

    public function getFeriados()
    {
        $ruta = getenv('URL_BACKEND') . 'feriados';

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
}
