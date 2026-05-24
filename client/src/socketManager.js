import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? `http://${window.location.hostname}:3000` : 'http://localhost:3000');
let socket = null;

export const getSocket = (accessToken) => {
    if (socket && accessToken) {
        // Keep the token fresh in case the socket drops and needs to reconnect
        socket.auth.token = accessToken;
    }
    if (!socket && accessToken) {
        socket = io(API_BASE, {
            auth: { token: accessToken },
            withCredentials: true
        });
    }
    return socket;
};

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};