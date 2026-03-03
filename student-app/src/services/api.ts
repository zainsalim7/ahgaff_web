import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const getApiUrl = () => {
  const expoBackendUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
                         process.env.EXPO_PUBLIC_BACKEND_URL ||
                         '';

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

// Offline cache for GET requests
const CACHEABLE_PATHS = [
  '/students/me', '/students/me/courses', '/courses',
  '/notifications/my', '/notifications/count', '/settings',
  '/departments', '/my-institution',
];

const shouldCache = (url: string) => CACHEABLE_PATHS.some(path => url?.includes(path));

api.interceptors.response.use(
  async (response) => {
    if (response.config.method === 'get' && shouldCache(response.config.url || '')) {
      try {
        await AsyncStorage.setItem(`cache_${response.config.url}`, JSON.stringify(response.data));
      } catch (e) {}
    }
    return response;
  },
  async (error) => {
    if (!error.response && error.config?.method === 'get' && shouldCache(error.config.url || '')) {
      try {
        const cached = await AsyncStorage.getItem(`cache_${error.config.url}`);
        if (cached) {
          return { data: JSON.parse(cached), status: 200, config: error.config, headers: {}, statusText: 'OK (cached)' };
        }
      } catch (e) {}
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (username: string, password: string) => api.post('/auth/login', { username, password }),
  getMe: () => api.get('/auth/me'),
  initAdmin: () => api.post('/init-admin'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword }),
  forceChangePassword: (newPassword: string) =>
    api.post('/auth/force-change-password', { new_password: newPassword }),
};

// Settings API
export const settingsAPI = {
  get: () => api.get('/settings'),
};

// Institution API
export const institutionAPI = {
  get: () => api.get('/my-institution'),
};

// Departments API
export const departmentsAPI = {
  getAll: () => api.get('/departments'),
};

// Notifications API
export const notificationsAPI = {
  getAll: (params?: { limit?: number; unread_only?: boolean }) => api.get('/notifications', { params }),
  getCount: () => api.get('/notifications/count'),
  markAsRead: (id: string) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
};

// Students API
export const studentsAPI = {
  getMe: () => api.get('/students/me'),
};

// Courses API
export const coursesAPI = {
  getAll: (params?: { department_id?: string }) => api.get('/courses', { params }),
};

// Attendance API
export const attendanceAPI = {
  getStudentAttendance: (studentId: string, courseId?: string) =>
    api.get(`/attendance/student/${studentId}`, { params: { course_id: courseId } }),
  getStudentStats: (studentId: string, courseId?: string) =>
    api.get(`/attendance/stats/student/${studentId}`, { params: { course_id: courseId } }),
};

// Lectures API
export const lecturesAPI = {
  getByCourse: (courseId: string) => api.get(`/lectures/${courseId}`),
};

export default api;
