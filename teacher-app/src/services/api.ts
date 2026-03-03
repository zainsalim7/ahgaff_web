import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const getApiUrl = () => {
  const expoBackendUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
                         process.env.EXPO_PUBLIC_BACKEND_URL || '';
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin.includes('localhost:3000')) return 'http://localhost:8001';
    if (origin.includes('preview.emergentagent.com')) return origin;
    if (origin.includes('railway.app')) return 'https://ahgaffweb-production-c582.up.railway.app';
    if (expoBackendUrl) return expoBackendUrl;
    return origin;
  }
  if (expoBackendUrl) return expoBackendUrl;
  const manifestUrl = Constants.expoConfig?.hostUri || Constants.manifest?.hostUri;
  if (manifestUrl) return `https://${manifestUrl.split(':')[0]}`;
  return '';
};

export const API_URL = getApiUrl();

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Offline cache
const CACHEABLE = ['/courses', '/departments', '/settings', '/notifications/my', '/notifications/count', '/lectures/today'];
const shouldCache = (url: string) => CACHEABLE.some(p => url?.includes(p));

api.interceptors.response.use(
  async (res) => {
    if (res.config.method === 'get' && shouldCache(res.config.url || '')) {
      try { await AsyncStorage.setItem(`cache_${res.config.url}`, JSON.stringify(res.data)); } catch (e) {}
    }
    return res;
  },
  async (error) => {
    if (!error.response && error.config?.method === 'get' && shouldCache(error.config.url || '')) {
      try {
        const cached = await AsyncStorage.getItem(`cache_${error.config.url}`);
        if (cached) return { data: JSON.parse(cached), status: 200, config: error.config, headers: {}, statusText: 'OK (cached)' };
      } catch (e) {}
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (username: string, password: string) => api.post('/auth/login', { username, password }),
  getMe: () => api.get('/auth/me'),
  initAdmin: () => api.post('/init-admin'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword }),
};

export const settingsAPI = { get: () => api.get('/settings') };
export const departmentsAPI = { getAll: () => api.get('/departments') };

export const notificationsAPI = {
  getAll: (params?: any) => api.get('/notifications', { params }),
  getCount: () => api.get('/notifications/count'),
  markAsRead: (id: string) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
};

export const coursesAPI = {
  getAll: (params?: any) => api.get('/courses', { params }),
};

export const lecturesAPI = {
  getToday: () => api.get('/lectures/today'),
  getByCourse: (courseId: string) => api.get(`/lectures/${courseId}`),
  create: (data: any) => api.post('/lectures', data),
};

export const enrollmentsAPI = {
  getStudents: (courseId: string) => api.get(`/enrollments/${courseId}/students`),
};

export const attendanceAPI = {
  recordSession: (data: any) => api.post('/attendance/session', data),
  getCourseStats: (courseId: string) => api.get(`/attendance/stats/course/${courseId}`),
  getCourseAttendance: (courseId: string) => api.get(`/attendance/course/${courseId}`),
  syncOffline: (records: any[]) => api.post('/sync/attendance', { attendance_records: records }),
};

export const teachersAPI = {
  getMe: () => api.get('/teachers/me'),
};

export default api;
