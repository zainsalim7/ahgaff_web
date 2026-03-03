import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// رابط الـ Backend على Railway
const RAILWAY_API = 'https://ahgaffweb-production-c582.up.railway.app';

const getApiUrl = () => {
  const envUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
                 process.env.EXPO_PUBLIC_BACKEND_URL || '';
  if (envUrl) return envUrl;
  return RAILWAY_API;
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
const CACHEABLE = ['/courses', '/departments', '/settings', '/notifications/my', '/notifications/count', '/students/me', '/students/me/courses'];
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

export const studentsAPI = {
  getMe: () => api.get('/students/me'),
  getMyCourses: () => api.get('/students/me/courses'),
  getMyAttendance: (courseId?: string) => api.get('/students/me/attendance', { params: courseId ? { course_id: courseId } : {} }),
};

export const coursesAPI = {
  getAll: (params?: any) => api.get('/courses', { params }),
};

export const lecturesAPI = {
  getToday: () => api.get('/lectures/today'),
};

export default api;
