import React from 'react';
import { Redirect } from 'expo-router';

export default function StudentExcusesPage() {
  return <Redirect href="/student-requests?tab=excuses" />;
}
