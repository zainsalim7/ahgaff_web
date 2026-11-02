import { create } from 'zustand';
import { advancedAccessAPI } from '../services/api';

interface RealEnforcementState {
  enabled: boolean;
  permissionKeys: string[];
  checked: boolean;
  checkAccess: () => Promise<void>;
  reset: () => void;
}

export const useRealEnforcementStore = create<RealEnforcementState>((set) => ({
  enabled: false,
  permissionKeys: [],
  checked: false,

  checkAccess: async () => {
    try {
      const { data } = await advancedAccessAPI.myEffectiveAccess();
      set({ enabled: !!data.enabled, permissionKeys: data.permission_keys || [], checked: true });
    } catch {
      set({ enabled: false, permissionKeys: [], checked: true });
    }
  },

  reset: () => set({ enabled: false, permissionKeys: [], checked: false }),
}));
