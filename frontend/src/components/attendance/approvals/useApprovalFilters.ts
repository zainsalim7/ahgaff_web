import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { EMPTY_FILTERS, Filters } from './types';

const RESET_PAGE_KEYS: (keyof Filters)[] = [
  'status', 'faculty_id', 'department_id', 'level', 'section', 'course_id', 'semester_id',
  'requested_by', 'new_status', 'q', 'lecture_from', 'lecture_to', 'requested_from', 'requested_to', 'sort',
];

const fromParams = (params: Record<string, any>): Filters => {
  const f: Filters = { ...EMPTY_FILTERS };
  (Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).forEach(k => {
    const v = params[k];
    if (v === undefined || v === null || v === '') return;
    if (k === 'page') (f as any)[k] = Math.max(1, parseInt(String(v), 10) || 1);
    else (f as any)[k] = String(v);
  });
  return f;
};

const syncUrl = (f: Filters) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const p = new URLSearchParams();
  (Object.keys(f) as (keyof Filters)[]).forEach(k => {
    const v = f[k];
    if (v === (EMPTY_FILTERS as any)[k] || v === '' || v === undefined) return;
    p.set(k, String(v));
  });
  const qs = p.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
};

export const useApprovalFilters = () => {
  const params = useLocalSearchParams<Record<string, string>>();
  const [filters, setFilters] = useState<Filters>(() => fromParams(params));
  const [debouncedQ, setDebouncedQ] = useState(filters.q);
  const timer = useRef<any>(null);

  useEffect(() => { syncUrl(filters); }, [filters]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebouncedQ(filters.q), 350);
    return () => timer.current && clearTimeout(timer.current);
  }, [filters.q]);

  const update = useCallback((patch: Partial<Filters>) => {
    setFilters(prev => {
      const next = { ...prev, ...patch };
      if (RESET_PAGE_KEYS.some(k => k in patch && patch[k] !== prev[k])) next.page = 1;
      if ('faculty_id' in patch && patch.faculty_id !== prev.faculty_id) { next.department_id = ''; next.course_id = ''; }
      if ('department_id' in patch && patch.department_id !== prev.department_id) next.course_id = '';
      if (('level' in patch && patch.level !== prev.level) || ('section' in patch && patch.section !== prev.section)) next.course_id = '';
      return next;
    });
  }, []);

  const reset = useCallback(() => setFilters({ ...EMPTY_FILTERS, view: filters.view }), [filters.view]);

  const effective = useMemo<Filters>(() => ({ ...filters, q: debouncedQ }), [filters, debouncedQ]);

  const activeCount = useMemo(() => RESET_PAGE_KEYS.filter(k => k !== 'status' && k !== 'sort' && filters[k] !== '').length, [filters]);

  return { filters, effective, update, reset, activeCount };
};
