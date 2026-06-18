import exampleService from '../services/example.service.js';

class ExampleController {
  async getExamples(req, res) {
    try {
      const examples = await exampleService.getExamples();
      res.json(examples);
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener los ejemplos' });
    }
  }
}

export default new ExampleController();
