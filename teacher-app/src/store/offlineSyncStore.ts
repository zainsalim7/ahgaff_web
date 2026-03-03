import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PendingRecord {
  id: string;
  course_id: string;
  course_name: string;
  lecture_date: string;
  lecture_time: string;
  students: { student_id: string; full_name: string; status: 'present' | 'absent' | 'excused' }[];
  created_at: string;
  synced: boolean;
}

interface OfflineSyncStore {
  pendingRecords: PendingRecord[];
  isSyncing: boolean;
  lastSyncTime: string | null;
  loadPending: () => Promise<void>;
  addRecord: (record: Omit<PendingRecord, 'id' | 'created_at' | 'synced'>) => Promise<void>;
  markSynced: (id: string) => Promise<void>;
  removeSynced: () => Promise<void>;
  setIsSyncing: (val: boolean) => void;
  setLastSyncTime: (time: string) => void;
  getPendingCount: () => number;
}

const STORAGE_KEY = 'teacher_offline_attendance';

export const useOfflineSyncStore = create<OfflineSyncStore>((set, get) => ({
  pendingRecords: [],
  isSyncing: false,
  lastSyncTime: null,

  loadPending: async () => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        const records: PendingRecord[] = JSON.parse(data);
        set({ pendingRecords: records });
      }
      const lastSync = await AsyncStorage.getItem('last_sync_time');
      if (lastSync) set({ lastSyncTime: lastSync });
    } catch (e) {
      console.error('Error loading pending records:', e);
    }
  },

  addRecord: async (record) => {
    const newRecord: PendingRecord = {
      ...record,
      id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date().toISOString(),
      synced: false,
    };
    const updated = [...get().pendingRecords, newRecord];
    set({ pendingRecords: updated });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },

  markSynced: async (id: string) => {
    const updated = get().pendingRecords.map(r => r.id === id ? { ...r, synced: true } : r);
    set({ pendingRecords: updated });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },

  removeSynced: async () => {
    const updated = get().pendingRecords.filter(r => !r.synced);
    set({ pendingRecords: updated });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },

  setIsSyncing: (val) => set({ isSyncing: val }),
  setLastSyncTime: async (time: string) => {
    set({ lastSyncTime: time });
    await AsyncStorage.setItem('last_sync_time', time);
  },

  getPendingCount: () => get().pendingRecords.filter(r => !r.synced).length,
}));
