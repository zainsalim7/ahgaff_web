/**
 * أداة تصدير التقارير كـ PDF
 * تدعم الويب عبر طباعة المتصفح
 */

import { Platform, Alert } from 'react-native';
import { formatGregorianDate, formatHijriDate, getAdenDate } from './dateUtils';

// واجهة بيانات التقرير
interface ReportData {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: (string | number)[][];
  summary?: { label: string; value: string | number }[];
}

/**
 * تصدير التقرير كـ PDF عبر طباعة المتصفح
 */
export async function exportToPDF(reportData: ReportData): Promise<void> {
  if (Platform.OS !== 'web') {
    Alert.alert('تنبيه', 'تصدير PDF متاح فقط على نسخة الويب حالياً');
    return;
  }

  try {
    // إنشاء نافذة جديدة للطباعة
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      Alert.alert('خطأ', 'يرجى السماح بالنوافذ المنبثقة لتصدير PDF');
      return;
    }

    // إنشاء محتوى HTML للتقرير
    const htmlContent = createPrintableHTML(reportData);
    
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // انتظار تحميل المحتوى ثم الطباعة
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        // إغلاق النافذة بعد الطباعة (اختياري)
        // printWindow.close();
      }, 250);
    };

    Alert.alert('نجاح', 'سيتم فتح نافذة الطباعة - اختر "حفظ كـ PDF" للتصدير');
  } catch (error) {
    console.error('PDF Export Error:', error);
    Alert.alert('خطأ', 'فشل في تصدير التقرير');
  }
}

/**
 * إنشاء HTML قابل للطباعة للتقرير
 */
function createPrintableHTML(reportData: ReportData): string {
  const today = getAdenDate();
  const gregorianDate = formatGregorianDate(today, { includeWeekday: true });
  const hijriDate = formatHijriDate(today);
  
  // شعار جامعة الأحقاف
  const UNIVERSITY_LOGO = 'https://ahgaff.edu.ye/pluginfile.php/1/theme_lambda2/favicon/1769931878/University%20Logo.png';

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>${reportData.title}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        body {
          font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
          direction: rtl;
          margin: 0;
          padding: 15px;
          background: white;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 20px;
          margin-bottom: 20px;
          border-bottom: 3px solid #1565c0;
          padding-bottom: 15px;
        }
        .header-logo {
          width: 70px;
          height: 70px;
          object-fit: contain;
        }
        .header-text {
          text-align: center;
        }
        .header-text h1 { color: #1565c0; margin: 0 0 5px 0; font-size: 22px; }
        .header-text p { color: #666; margin: 0; font-size: 11px; }
        .title { text-align: center; margin-bottom: 15px; }
        .title h2 { color: #333; margin: 0 0 6px 0; font-size: 16px; }
        .title p { color: #666; margin: 0; font-size: 11px; }
        .date-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 15px;
          padding: 8px 12px;
          background: #f5f5f5;
          border-radius: 6px;
        }
        .date-info span { font-size: 11px; }
        .summary {
          display: flex;
          justify-content: space-around;
          background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
          border-radius: 8px;
          margin-bottom: 15px;
          padding: 12px;
        }
        .summary-item { text-align: center; padding: 8px; }
        .summary-value { font-size: 18px; font-weight: bold; color: #1565c0; }
        .summary-label { font-size: 10px; color: #666; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th {
          background: linear-gradient(135deg, #1565c0 0%, #1976d2 100%);
          color: white;
          padding: 8px 5px;
          text-align: center;
          font-size: 10px;
          border: 1px solid #1565c0;
        }
        td {
          padding: 6px 5px;
          text-align: center;
          font-size: 9px;
          border: 1px solid #ddd;
        }
        tr:nth-child(even) { background: #f9f9f9; }
        tr:hover { background: #e8f4fc; }
        .footer {
          margin-top: 20px;
          text-align: center;
          color: #999;
          font-size: 9px;
          border-top: 1px solid #eee;
          padding-top: 12px;
        }
        .footer-logo {
          width: 30px;
          height: 30px;
          margin-bottom: 5px;
          opacity: 0.5;
        }
        .no-data { text-align: center; color: #999; padding: 30px; }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${UNIVERSITY_LOGO}" alt="شعار جامعة الأحقاف" class="header-logo" crossorigin="anonymous">
        <div class="header-text">
          <h1>جامعة الأحقاف</h1>
          <p>نظام الحضور المركزي</p>
        </div>
      </div>
      
      <div class="title">
        <h2>${reportData.title}</h2>
        ${reportData.subtitle ? `<p>${reportData.subtitle}</p>` : ''}
      </div>
      
      <div class="date-info">
        <div><span style="color: #666;">تاريخ التقرير:</span> <span style="color: #333; margin-right: 5px;">${gregorianDate}</span></div>
        <div><span style="color: #888;">${hijriDate}</span></div>
      </div>
      
      ${reportData.summary ? createSummaryHTMLPrint(reportData.summary) : ''}
      
      ${createTableHTMLPrint(reportData.columns, reportData.rows)}
      
      <div class="footer">
        <img src="${UNIVERSITY_LOGO}" alt="" class="footer-logo" crossorigin="anonymous">
        <div>تم إنشاء هذا التقرير آلياً من نظام الحضور المركزي - جامعة الأحقاف</div>
      </div>
    </body>
    </html>
  `;
}

/**
 * إنشاء HTML للملخص (للطباعة)
 */
function createSummaryHTMLPrint(summary: { label: string; value: string | number }[]): string {
  const items = summary.map(item => `
    <div class="summary-item">
      <div class="summary-value">${item.value}</div>
      <div class="summary-label">${item.label}</div>
    </div>
  `).join('');
  return `<div class="summary">${items}</div>`;
}

/**
 * إنشاء HTML للجدول (للطباعة)
 */
function createTableHTMLPrint(columns: string[], rows: (string | number)[][]): string {
  if (rows.length === 0) {
    return '<p class="no-data">لا توجد بيانات</p>';
  }

  const headerCells = columns.map(col => `<th>${col}</th>`).join('');
  const bodyRows = rows.map(row => {
    const cells = row.map(cell => `<td>${cell}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
}

/**
 * تحضير بيانات تقرير الحضور الشامل
 */
export function prepareAttendanceOverviewData(
  courses: any[],
  summary: any,
  departmentName?: string
): ReportData {
  return {
    title: 'تقرير الحضور الشامل',
    subtitle: departmentName ? `قسم: ${departmentName}` : 'جميع الأقسام',
    columns: ['#', 'المقرر', 'الكود', 'المدرس', 'المحاضرات', 'نسبة الحضور'],
    rows: courses.map((course, index) => [
      index + 1,
      course.course_name || '-',
      course.course_code || '-',
      course.teacher_name || '-',
      course.total_lectures || 0,
      `${course.attendance_rate || 0}%`,
    ]),
    summary: summary ? [
      { label: 'إجمالي المقررات', value: summary.total_courses || 0 },
      { label: 'متوسط الحضور', value: `${summary.avg_attendance_rate || 0}%` },
    ] : undefined,
  };
}

/**
 * تحضير بيانات تقرير الطلاب المتغيبين
 */
export function prepareAbsentStudentsData(
  students: any[],
  courseName?: string
): ReportData {
  return {
    title: 'تقرير الطلاب المتغيبين',
    subtitle: courseName || 'جميع المقررات',
    columns: ['#', 'اسم الطالب', 'الرقم الأكاديمي', 'المقرر', 'الغياب', 'النسبة'],
    rows: students.map((student, index) => [
      index + 1,
      student.name || '-',
      student.student_id || '-',
      student.course_name || '-',
      student.absences || 0,
      `${student.absence_rate || 0}%`,
    ]),
  };
}

/**
 * تحضير بيانات تقرير الإنذارات
 */
export function prepareWarningsData(students: any[]): ReportData {
  return {
    title: 'تقرير الإنذارات والحرمان',
    columns: ['#', 'اسم الطالب', 'الرقم الأكاديمي', 'المقرر', 'نسبة الغياب', 'الحالة'],
    rows: students.map((student, index) => [
      index + 1,
      student.name || '-',
      student.student_id || '-',
      student.course_name || '-',
      `${student.absence_rate || 0}%`,
      student.status === 'deprived' ? 'محروم' : 'إنذار',
    ]),
  };
}

/**
 * تحضير بيانات التقرير اليومي
 */
export function prepareDailyReportData(
  lectures: any[],
  date: string,
  summary?: any
): ReportData {
  return {
    title: 'التقرير اليومي',
    subtitle: date,
    columns: ['#', 'المقرر', 'المدرس', 'الوقت', 'الحاضرون', 'الغائبون', 'النسبة'],
    rows: lectures.map((lecture, index) => [
      index + 1,
      lecture.course_name || '-',
      lecture.teacher_name || '-',
      `${lecture.start_time || ''} - ${lecture.end_time || ''}`,
      lecture.present || 0,
      lecture.absent || 0,
      `${lecture.attendance_rate || 0}%`,
    ]),
    summary: summary ? [
      { label: 'إجمالي المحاضرات', value: summary.total_lectures || 0 },
      { label: 'متوسط الحضور', value: `${summary.avg_attendance || 0}%` },
    ] : undefined,
  };
}

/**
 * تحضير بيانات تقرير طالب
 */
export function prepareStudentReportData(
  student: any,
  courses: any[]
): ReportData {
  return {
    title: 'تقرير طالب',
    subtitle: `${student?.name || ''} - ${student?.student_id || ''}`,
    columns: ['#', 'المقرر', 'الكود', 'الحضور', 'الغياب', 'النسبة', 'الحالة'],
    rows: courses.map((course, index) => [
      index + 1,
      course.course_name || '-',
      course.course_code || '-',
      course.present || 0,
      course.absent || 0,
      `${course.attendance_rate || 0}%`,
      course.status === 'deprived' ? 'محروم' : course.status === 'warning' ? 'إنذار' : 'عادي',
    ]),
  };
}

/**
 * تحضير بيانات تقرير مقرر
 */
export function prepareCourseReportData(
  course: any,
  students: any[],
  summary?: any
): ReportData {
  return {
    title: 'تقرير مقرر',
    subtitle: `${course?.name || ''} - ${course?.code || ''}`,
    columns: ['#', 'اسم الطالب', 'الرقم الأكاديمي', 'الحضور', 'الغياب', 'النسبة', 'الحالة'],
    rows: students.map((student, index) => [
      index + 1,
      student.name || '-',
      student.student_id || '-',
      student.present || 0,
      student.absent || 0,
      `${student.attendance_rate || 0}%`,
      student.status === 'deprived' ? 'محروم' : student.status === 'warning' ? 'إنذار' : 'عادي',
    ]),
    summary: summary ? [
      { label: 'إجمالي الطلاب', value: summary.total_students || 0 },
      { label: 'متوسط الحضور', value: `${summary.avg_attendance || 0}%` },
    ] : undefined,
  };
}

/**
 * تحضير بيانات تقرير نصاب المدرس
 */
export function prepareTeacherWorkloadData(teachers: any[]): ReportData {
  return {
    title: 'تقرير نصاب المدرسين',
    columns: ['#', 'اسم المدرس', 'المقررات', 'المحاضرات', 'الساعات'],
    rows: teachers.map((teacher, index) => [
      index + 1,
      teacher.name || '-',
      teacher.courses_count || 0,
      teacher.lectures_count || 0,
      teacher.hours || 0,
    ]),
  };
}
