import React from 'react';
import { Platform, ScrollView, View } from 'react-native';

// صندوق عرض بحجم الشاشة مع سحب أفقي ورأسي داخله (للجداول الطويلة/العريضة)
export const ScrollBox = ({ children, maxHeight = '70vh', testID, rn, minWidth }: { children: React.ReactNode; maxHeight?: string; testID?: string; rn?: boolean; minWidth?: number }) => {
  if (Platform.OS !== 'web') return <ScrollView horizontal><View>{children}</View></ScrollView>;
  return (
    <div data-testid={testID} style={{ direction: 'rtl', overflow: 'auto', maxHeight, width: '100%', position: 'relative' }}>
      {rn ? <div style={{ direction: 'ltr', minWidth: minWidth || 0, width: '100%' }}>{children}</div> : children}
    </div>
  );
};
