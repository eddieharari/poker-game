import { io } from 'socket.io-client';
let socket = null;
export function getSocket() {
    if (!socket)
        throw new Error('Socket not initialised — call connectSocket() first');
    return socket;
}
export function connectSocket(token, nickname, avatarUrl) {
    if (socket?.connected)
        return socket;
    socket = io(import.meta.env.VITE_SERVER_URL, {
        auth: { token, nickname, avatarUrl },
        autoConnect: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
    });
    return socket;
}
export function disconnectSocket() {
    socket?.disconnect();
    socket = null;
}
