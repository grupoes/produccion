import { Server } from "socket.io";

let ioInstance = null;

export function getIO() {
  return ioInstance;
}

// Monta Socket.IO sobre el http server y reusa la sesión de Express
// para autenticar cada conexión. Al conectar, une el socket a un room
// `user:<id>` para que el backend pueda enviarle eventos directos.
export function setupSocket(httpServer, sessionMiddleware) {
  const io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
  });

  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
  });

  io.on("connection", (socket) => {
    const user = socket.request.session?.user;
    if (!user || !user.id) {
      socket.disconnect(true);
      return;
    }
    socket.join(`user:${user.id}`);
    socket.data.userId = user.id;
    socket.data.user = user;
  });

  ioInstance = io;
  return io;
}
