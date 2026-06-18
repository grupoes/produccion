import "dotenv/config";
import http from "http";
import app from "./app.js";
import { setupSocket, getIO } from "./config/socket.js";
import { sessionMiddleware } from "./config/session.js";

const PORT = process.env.PORT || 3000;

const httpServer = http.createServer(app);
setupSocket(httpServer, sessionMiddleware);

// Expone `io` en app.locals para que services/controllers puedan emitir
// eventos (ej. `app.locals.io.to("user:5").emit("nueva-notificacion", ...)`).
app.locals.io = getIO();

httpServer.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
