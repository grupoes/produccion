import express from 'express';
import exampleController from '../controllers/example.controller.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'API funcionando correctamente' });
});

router.get('/examples', exampleController.getExamples);

export default router;
