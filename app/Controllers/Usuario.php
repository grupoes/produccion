<?php

namespace App\Controllers;

class Usuario extends BaseController
{
    public function index()
    {
        return view('usuario/index');
    }

    public function api_dni_ruc($tipo, $numero)
    {
        $token = "facturalaya_erickpeso_05jFE7sAOudi8j0";

        $bloquear_busquedas = false;
        if ($bloquear_busquedas) {
            $resp['respuesta'] = 'error';
            $resp['titulo'] = 'Error';
            $resp['mensaje'] = 'Tenemos Problemas en los Servidores de SUNAT y RENIEC, ingresa los datos manualmente por favor...';
            return $this->response->setJSON($resp);
        }

        if ($tipo == 'dni') {
            $ruta = "https://facturalahoy.com/api/persona/" . $numero . '/' . $token . '/completa';
        } elseif ($tipo == 'ruc') {
            $ruta = "https://facturalahoy.com/api/empresa/" . $numero . '/' . $token . '/completa';
        } else {
            $resp['respuesta'] = 'error';
            $resp['titulo'] = 'Error';
            $resp['mensaje'] = 'Tipo de Documento Desconocido';
            return $this->response->setJSON($resp);
        }

        $curl = curl_init();
        curl_setopt_array($curl, array(
            CURLOPT_RETURNTRANSFER => 1,
            CURLOPT_URL => $ruta,
            CURLOPT_USERAGENT => 'Consulta Datos',
            CURLOPT_CONNECTTIMEOUT => 0,
            CURLOPT_TIMEOUT => 400,
            CURLOPT_FAILONERROR => true
        ));

        $data = curl_exec($curl);
        if (curl_error($curl)) {
            $error_msg = curl_error($curl);
        }

        curl_close($curl);

        if (isset($error_msg)) {
            $resp['respuesta'] = 'error';
            $resp['titulo'] = 'Error';
            $resp['data'] = $data;
            $resp['encontrado'] = false;
            $resp['mensaje'] = 'Error en Api de Búsqueda';
            $resp['errores_curl'] = $error_msg;
            return $this->response->setJSON($resp);
        }

        $data_resp = json_decode($data);
        if (!isset($data_resp->respuesta) || $data_resp->respuesta == 'error') {
            $resp['respuesta'] = 'error';
            $resp['titulo'] = 'Error';
            $resp['encontrado'] = false;
            $resp['data_resp'] = $data_resp;
            return $this->response->setJSON($resp);
        }

        $resp['respuesta'] = 'ok';
        $resp['encontrado'] = true;
        $resp['api'] = true;
        $resp['data'] = json_decode($data);

        return $this->response->setJSON($resp);
    }

    public function create()
    {
        $usuarioId = $this->request->getPost('usuarioId');
        $tipoDocumento = $this->request->getPost('tipoDocumento');
        $numeroDocumento = $this->request->getPost('numeroDocumento');
        $nombres = $this->request->getPost('nombres');
        $apellidos = $this->request->getPost('apellidos');
        $fechaNacimiento = $this->request->getPost('fechaNacimiento');
        $celular = $this->request->getPost('celular');
        $direccion = $this->request->getPost('direccion');
        $rol_id = $this->request->getPost('rol_id');
        $correo = $this->request->getPost('correo');
        $password = $this->request->getPost('password');

        $ruta = getenv('URL_BACKEND') . 'usuario/create';

        $client = \Config\Services::curlrequest();

        $response = $client->post($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false,
            'json' => [
                'usuarioId' => $usuarioId,
                'tipoDocumento' => $tipoDocumento,
                'numeroDocumento' => $numeroDocumento,
                'nombres' => $nombres,
                'apellidos' => $apellidos,
                'fechaNacimiento' => $fechaNacimiento,
                'celular' => $celular,
                'direccion' => $direccion,
                'rol_id' => $rol_id,
                'correo' => $correo,
                'password' => $password
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

    public function getUsers()
    {
        $ruta = getenv('URL_BACKEND') . 'usuario/get-all';

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

    public function getUser($id)
    {
        $ruta = getenv('URL_BACKEND') . 'usuario/get-row/' . $id;

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

    public function delete($id)
    {
        $ruta = getenv('URL_BACKEND') . 'usuario/delete/' . $id;

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
