import { create } from 'zustand';
import { advancedAccessAPI } from '../services/api';

interface AdvancedAccessContextState {
  hasAccess: boolean;
  isAdmin: boolean;
  subPermissions: string[];
  contexts: any[];
  activeContext: any | null;
  checked: boolean;
  checkAccess: () => Promise<void>;
  loadContexts: () => Promise<void>;
  switchContext: (ctx: any) => Promise<void>;
  clearContext: () => void;
}

export const useAdvancedAccessContextStore = create<AdvancedAccessContextState>((set, get) => ({
  hasAccess: false,
  isAdmin: false,
  subPermissions: [],
  contexts: [],
  activeContext: null,
  checked: false,

  checkAccess: async () => {
    try {
      const res = await advancedAccessAPI.myAccess();
      const data = res.data || {};
      set({ hasAccess: !!data.has_access, isAdmin: !!data.is_admin, subPermissions: data.sub_permissions || [], checked: true });
      if (data.has_access) {
        get().loadContexts();
      }
    } catch (e) {
      set({ hasAccess: false, isAdmin: false, subPermissions: [], checked: true });
    }
  },

  loadContexts: async () => {
    try {
      const res = await advancedAccessAPI.myContexts();
      set({ contexts: res.data || [] });
    } catch (e) { /* ignore */ }
  },

  switchContext: async (ctx: any) => {
    try {
      const res = await advancedAccessAPI.getAssignmentContext(ctx.id);
      set({ activeContext: res.data });
    } catch (e) { /* ignore */ }
  },

  clearContext: () => set({ activeContext: null }),
}));
