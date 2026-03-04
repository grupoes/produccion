<?php

namespace App\Controllers;

class Auth extends BaseController
{
    public function index()
    {
        return view('auth/login');
    }

    public function login()
    {
        $username = $this->request->getPost('email');
        $password = $this->request->getPost('password');

        $ruta = getenv('URL_BACKEND') . 'auth/login';

        $client = \Config\Services::curlrequest();

        $response = $client->post($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false,
            'json' => [
                'username' => $username,
                'password' => $password
            ]
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['message']['error']
            ]);
        }

        // Guardar datos en sesión
        $session = session();
        $session->set('usuario', $data['result']['usuario']);
        $session->set('nombres', $data['result']['nombres']);
        $session->set('apellidos', $data['result']['apellidos']);
        $session->set('id_user', $data['result']['id']);
        $session->set('rol_id', $data['result']['rol_id']);
        $session->set('rol', $data['result']['rol']);
        $session->set('isLoggedIn', true);

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['result']
        ]);
    }

    public function logout()
    {
        // Destroy session and redirect to login page
        $session = session();
        $session->destroy();

        // If request is AJAX, return JSON; otherwise redirect
        if ($this->request->isAJAX()) {
            return $this->response->setJSON([
                'success' => true,
                'message' => 'Sesión cerrada'
            ]);
        }

        // Redirigir a la URL base del sitio para evitar mostrar "index.php/"
        return redirect()->to(base_url());
    }
}
