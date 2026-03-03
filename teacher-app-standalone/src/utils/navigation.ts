import { router, usePathname } from 'expo-router';
import { Platform } from 'react-native';

/**
 * دالة مساعدة للعودة للصفحة السابقة أو للرئيسية
 * تحل مشكلة عدم عمل router.back() بشكل صحيح على الويب
 */
export const goBack = () => {
  // على الويب، نتحقق من history
  if (Platform.OS === 'web') {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      router.replace('/');
    }
  } else {
    // على الموبايل، نستخدم router.back()
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }
};

/**
 * العودة للصفحة الرئيسية مباشرة
 */
export const goHome = () => {
  router.replace('/');
};

/**
 * العودة لصفحة معينة
 */
export const goTo = (path: string) => {
  router.push(path);
};

/**
 * استبدال الصفحة الحالية بصفحة أخرى (لا يضيف للتاريخ)
 */
export const replaceTo = (path: string) => {
  router.replace(path);
};
