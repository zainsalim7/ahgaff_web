// إعادة توجيه: صفحة المقررات نُقلت إلى /manage-courses (خارج tabs)
// لحل مشكلة عدم التمرير داخل React Navigation Tabs container.
import { Redirect } from 'expo-router';

export default function CoursesTabRedirect() {
  return <Redirect href="/manage-courses" />;
}
