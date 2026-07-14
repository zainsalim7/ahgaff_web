import React from 'react';
import { View, Text } from 'react-native';
import { formatTimeArabic, timeDiffMinutes, durationArabic, earlyMorningWarning } from '../utils/timeFormat';

export const TimeRangeSummary = ({ start, end, compact }: { start?: string; end?: string; compact?: boolean }) => {
  if (!start || !end) return null;
  const diff = timeDiffMinutes(start, end);
  if (diff === null) return null;
  const warn = earlyMorningWarning(start);
  const invalid = diff <= 0;
  return (
    <View style={{ marginTop: 8, gap: 4 }} data-testid="time-range-summary">
      <Text
        style={{
          fontSize: compact ? 11 : 13,
          color: invalid ? '#c62828' : '#2e7d32',
          fontWeight: '700',
          textAlign: 'right',
          backgroundColor: invalid ? '#ffebee' : '#e8f5e9',
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 8,
        }}
        data-testid={invalid ? 'time-range-invalid' : 'time-range-valid'}
      >
        {invalid
          ? `⚠️ النهاية (${formatTimeArabic(end)}) تقع قبل البداية (${formatTimeArabic(start)}) — تأكد من اختيار ص/م الصحيحة`
          : `🕐 من ${formatTimeArabic(start)} إلى ${formatTimeArabic(end)} — المدة: ${durationArabic(diff)}`}
      </Text>
      {!invalid && warn ? (
        <Text style={{ fontSize: compact ? 10 : 12, color: '#e65100', fontWeight: '600', textAlign: 'right' }}>
          ⏰ {warn}
        </Text>
      ) : null}
    </View>
  );
};
