import axios from 'axios';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:5001';

export function getAuthToken() {
  return sessionStorage.getItem('trybo_token') || localStorage.getItem('trybo_token');
}

export function setAuthToken(token) {
  sessionStorage.setItem('trybo_token', token);
  localStorage.setItem('trybo_token', token);
}

export function clearAuthToken() {
  sessionStorage.removeItem('trybo_token');
  localStorage.removeItem('trybo_token');
}

export const api = axios.create({
  baseURL: API_URL,
});

// Automatically attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function createSocket(token) {
  return io(WS_URL, {
    auth: { token: token || getAuthToken() },
  });
}
