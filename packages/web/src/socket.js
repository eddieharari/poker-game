import { io } from 'socket.io-client';
let socket = null;
export function getSocket() {
    if (!socket)
        throw new Error('Socket not initialised — call connectSocket() first');
    return socket;
}
export function connectSocket(token, nickname, avatarUrl) {
    if (socket)
        return socket;
    socket = io(import.meta.env.VITE_SERVER_URL || window.location.origin, {
        auth: { token, nickname, avatarUrl },
        autoConnect: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
    });
    // Session lifecycle events — handled globally so they fire regardless of which page is mounted
    socket.on('session:duplicate', () => {
        // Lazy import to avoid circular dependency
        import('./store/authStore.js').then(({ useAuthStore }) => {
            useAuthStore.getState().setDuplicateSession(true);
        });
    });
    socket.on('session:kicked', () => {
        import('./store/authStore.js').then(({ useAuthStore }) => {
            useAuthStore.getState().signOut();
        });
    });
    return socket;
}
export function disconnectSocket() {
    socket?.disconnect();
    socket = null;
}
