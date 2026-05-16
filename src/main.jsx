import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import {
  Bell,
  BookOpen,
  Bot,
  CalendarClock,
  CalendarDays,
  Camera,
  CheckCircle2,
  CreditCard,
  Download,
  Edit3,
  Eye,
  GraduationCap,
  History,
  LayoutDashboard,
  LogIn,
  LogOut,
  Plus,
  Printer,
  QrCode,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Users,
  XCircle
} from 'lucide-react';
import { auth, db, uploadFileToStorage } from './firebase';
import './styles.css';

const FIRESTORE_COLLECTIONS = ['students', 'schoolYears', 'teachers', 'subjects', 'teacherSchedules', 'studentSubjects', 'payments', 'attendanceLogs', 'admins'];
const ALL = 'الكل';
const PAID = 'مدفوع';
const UNPAID = 'غير مدفوع';
const EXPIRED = 'منتهي الصلاحية';
const SOON = 'سينتهي قريباً';
const CREDIT = 'كريدي';
const AI_ASSISTANT_NAME = 'deepseek/deepseek-v4-flash:free';
const AI_WELCOME_MESSAGE = `مرحباً، أنا ${AI_ASSISTANT_NAME}، كيف يمكنني مساعدتك في إدارة الجمعية اليوم؟`;

const SCHOOL_YEARS = [
  'السنة الأولى ابتدائي',
  'السنة الثانية ابتدائي',
  'السنة الثالثة ابتدائي',
  'السنة الرابعة ابتدائي',
  'السنة الخامسة ابتدائي',
  'السنة الأولى متوسط',
  'السنة الثانية متوسط',
  'السنة الثالثة متوسط',
  'السنة الرابعة متوسط',
  'السنة الأولى ثانوي',
  'السنة الثانية ثانوي',
  'السنة الثالثة ثانوي'
];

const WEEK_DAYS = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const SUBJECT_SUGGESTIONS = ['الرياضيات', 'اللغة العربية', 'اللغة الفرنسية', 'اللغة الإنجليزية', 'العلوم الطبيعية', 'الفيزياء', 'التاريخ والجغرافيا'];

const todayISO = () => new Date().toISOString().slice(0, 10);
const nowISO = () => new Date().toISOString();
const uid = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const money = (n) => new Intl.NumberFormat('ar-DZ', { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 }).format(Number(n || 0));
const dateText = (value) => value ? new Intl.DateTimeFormat('ar-DZ').format(new Date(value)) : 'غير محدد';
const dateTimeText = (value) => value ? new Intl.DateTimeFormat('ar-DZ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'غير محدد';
const timeRange = (schedule) => schedule ? `${schedule.day || ''} ${schedule.startTime || ''}${schedule.endTime ? ` - ${schedule.endTime}` : ''}`.trim() : 'غير محدد';
const daysBetween = (a, b) => Math.ceil((new Date(b).setHours(0, 0, 0, 0) - new Date(a).setHours(0, 0, 0, 0)) / 86400000);
const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Number(months || 1));
  return d.toISOString().slice(0, 10);
};
const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 30));
  return d.toISOString().slice(0, 10);
};

const emptyStore = {
  settings: {
    associationName: '',
    logo: '',
    defaultDurationMonths: '',
    soonDays: '',
    sounds: false,
    successTone: '',
    alertTone: ''
  },
  admins: [],
  students: [],
  payments: [],
  credits: [],
  attendanceLogs: [],
  subjects: [],
  teachers: [],
  teacherSchedules: [],
  studentSubjects: []
};

function normalizeYear(value) {
  if (SCHOOL_YEARS.includes(value)) return value;
  const text = String(value || '');
  return SCHOOL_YEARS.find(year => text.includes(year)) || value || '';
}

function hydrateStudent(student = {}, index = 0) {
  const hasActivePaymentData = Boolean(student.lastPaymentDate && student.expiryDate);
  const hydrated = {
    id: uid('stu'),
    secureId: uid('qr'),
    registrationNumber: `REG-${new Date().getFullYear()}-${String(index + 1).padStart(3, '0')}`,
    fullName: '',
    phone: '',
    guardianName: '',
    guardianPhone: '',
    level: '',
    group: '',
    registrationDate: '',
    lastPaymentDate: '',
    expiryDate: '',
    creditAmount: hasActivePaymentData ? 0 : '',
    debtStartDate: '',
    lastReminderDate: '',
    creditNotes: '',
    photo: '',
    notes: '',
    ...student
  };
  return {
    ...hydrated,
    level: normalizeYear(hydrated.level),
    creditAmount: hydrated.creditAmount ?? (hasActivePaymentData ? 0 : ''),
    debtStartDate: hydrated.debtStartDate ?? '',
    lastReminderDate: hydrated.lastReminderDate ?? '',
    creditNotes: hydrated.creditNotes ?? ''
  };
}

function hydrateSubject(subject = {}) {
  return { id: uid('sub'), name: '', notes: '', ...subject };
}

function hydrateTeacher(teacher = {}) {
  const hydrated = {
    id: uid('tea'),
    fullName: '',
    phone: '',
    subjectIds: [],
    levels: [],
    groups: [],
    notes: '',
    ...teacher
  };
  return {
    ...hydrated,
    subjectIds: Array.isArray(hydrated.subjectIds) ? hydrated.subjectIds : [],
    levels: Array.isArray(hydrated.levels) ? hydrated.levels : [],
    groups: Array.isArray(hydrated.groups) ? hydrated.groups : []
  };
}

function hydrateSchedule(schedule = {}) {
  return {
    id: uid('sch'),
    teacherId: '',
    day: '',
    startTime: '',
    endTime: '',
    subjectId: '',
    level: '',
    group: '',
    room: '',
    notes: '',
    ...schedule
  };
}

function hydrateStudentSubject(link = {}) {
  return {
    id: uid('ssub'),
    studentId: '',
    subjectId: '',
    teacherId: '',
    scheduleId: '',
    note: '',
    ...link
  };
}

function normalizeStore(data) {
  const source = data || emptyStore;
  return {
    ...emptyStore,
    ...source,
    settings: { ...emptyStore.settings, ...(source.settings || {}) },
    admins: source.admins?.length ? source.admins : emptyStore.admins,
    students: (source.students || []).map(hydrateStudent),
    payments: source.payments || [],
    credits: source.credits || [],
    attendanceLogs: source.attendanceLogs || [],
    subjects: (source.subjects || []).map(hydrateSubject),
    teachers: (source.teachers || []).map(hydrateTeacher),
    teacherSchedules: (source.teacherSchedules || []).map(hydrateSchedule),
    studentSubjects: (source.studentSubjects || []).map(hydrateStudentSubject)
  };
}

function cleanForFirestore(value) {
  if (Array.isArray(value)) return value.map(cleanForFirestore);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined && typeof item !== 'function')
        .filter(([key]) => key !== 'paymentStatus')
        .map(([key, item]) => [key, cleanForFirestore(item)])
    );
  }
  return value ?? '';
}

function sameFirebaseData(a, b) {
  return JSON.stringify(cleanForFirestore(a || {})) === JSON.stringify(cleanForFirestore(b || {}));
}

function readFirestoreDoc(item) {
  const { updatedAt, createdAt, lastLoginAt, ...data } = item.data() || {};
  return { id: item.id, ...data };
}

function toMap(items = []) {
  return new Map(items.filter(item => item?.id).map(item => [item.id, item]));
}

function buildCreditDoc(student, settings) {
  const paymentStatus = getPaymentStatus(student, settings);
  if (paymentStatus !== UNPAID && Number(student.creditAmount || 0) <= 0) return null;
  return {
    id: student.id,
    studentId: student.id,
    fullName: student.fullName || '',
    level: student.level || '',
    group: student.group || '',
    phone: student.phone || '',
    guardianName: student.guardianName || '',
    guardianPhone: student.guardianPhone || '',
    amount: Number(student.creditAmount || 0),
    debtStartDate: student.debtStartDate || student.registrationDate || '',
    lastReminderDate: student.lastReminderDate || '',
    notes: student.creditNotes || '',
    paymentStatus: CREDIT
  };
}

async function syncCollection(collectionName, beforeItems = [], afterItems = []) {
  const before = toMap(beforeItems);
  const after = toMap(afterItems);
  const batch = writeBatch(db);
  let changed = 0;

  after.forEach((item, id) => {
    if (!sameFirebaseData(before.get(id), item)) {
      batch.set(doc(db, collectionName, id), { ...cleanForFirestore(item), updatedAt: serverTimestamp() }, { merge: true });
      changed += 1;
    }
  });

  before.forEach((_, id) => {
    if (!after.has(id)) {
      batch.delete(doc(db, collectionName, id));
      changed += 1;
    }
  });

  if (changed) await batch.commit();
}

async function syncCredits(beforeStore, afterStore) {
  const beforeCredits = beforeStore.students
    .map(student => buildCreditDoc(student, beforeStore.settings))
    .filter(Boolean);
  const afterCredits = afterStore.students
    .map(student => buildCreditDoc(student, afterStore.settings))
    .filter(Boolean);
  await syncCollection('credits', beforeCredits, afterCredits);
}

async function persistStoreChanges(beforeStore, afterStore) {
  await Promise.all([
    ...FIRESTORE_COLLECTIONS.map(collectionName => syncCollection(collectionName, beforeStore[collectionName], afterStore[collectionName])),
    sameFirebaseData(beforeStore.settings, afterStore.settings)
      ? Promise.resolve()
      : setDoc(doc(db, 'settings', 'app'), { ...cleanForFirestore(afterStore.settings), updatedAt: serverTimestamp() }, { merge: true }),
    syncCredits(beforeStore, afterStore)
  ]);
}

function getPaymentStatus(student, settings) {
  if (!student.lastPaymentDate || !student.expiryDate) return UNPAID;
  const remaining = daysBetween(todayISO(), student.expiryDate);
  if (remaining < 0) return EXPIRED;
  if (settings.soonDays && remaining <= Number(settings.soonDays)) return SOON;
  return PAID;
}

function isCreditStudent(student) {
  return student.paymentStatus === UNPAID || Number(student.creditAmount || 0) > 0;
}

function getStudentAcademicRows(studentId, store) {
  return store.studentSubjects
    .filter(link => link.studentId === studentId)
    .map(link => ({
      ...link,
      subject: store.subjects.find(subject => subject.id === link.subjectId),
      teacher: store.teachers.find(teacher => teacher.id === link.teacherId),
      schedule: store.teacherSchedules.find(schedule => schedule.id === link.scheduleId)
    }));
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function listLines(items, emptyText = 'لا توجد نتائج حالياً.') {
  return items.length ? items.map((item, index) => `${index + 1}. ${item}`).join('\n') : emptyText;
}

function studentLine(student) {
  return `${student.fullName || 'بدون اسم'} - ${student.level || 'سنة غير محددة'} - ${student.group || 'فوج غير محدد'} - الحالة: ${student.paymentStatus}`;
}

function findStudentByQuestion(question, students) {
  const q = normalizeSearchText(question);
  return students.find(student => {
    const name = normalizeSearchText(student.fullName);
    return name && (q.includes(name) || name.split(' ').filter(Boolean).some(part => part.length > 2 && q.includes(part)));
  });
}

function findTeacherByQuestion(question, teachers) {
  const q = normalizeSearchText(question);
  return teachers.find(teacher => {
    const name = normalizeSearchText(teacher.fullName);
    return name && (q.includes(name) || name.split(' ').filter(Boolean).some(part => part.length > 2 && q.includes(part)));
  });
}

function findSubjectByQuestion(question, subjects) {
  const q = normalizeSearchText(question);
  const aliases = [
    ['رياض', 'الرياضيات'],
    ['فرنسي', 'اللغة الفرنسية'],
    ['فرنسية', 'اللغة الفرنسية'],
    ['انجليزي', 'اللغة الإنجليزية'],
    ['انجليزية', 'اللغة الإنجليزية'],
    ['عربي', 'اللغة العربية'],
    ['عربية', 'اللغة العربية'],
    ['علوم', 'العلوم الطبيعية'],
    ['فيزياء', 'الفيزياء'],
    ['تاريخ', 'التاريخ والجغرافيا'],
    ['جغرافيا', 'التاريخ والجغرافيا']
  ];
  return subjects.find(subject => {
    const name = normalizeSearchText(subject.name);
    if (name && q.includes(name)) return true;
    return aliases.some(([alias, canonical]) => q.includes(normalizeSearchText(alias)) && name === normalizeSearchText(canonical));
  });
}

function hasStudentWord(text) {
  return ['تلميذ', 'تلاميذ', 'طالب', 'طلاب'].some(word => text.includes(word));
}

function hasAmountWord(text) {
  return ['مبلغ', 'مبالغ', 'مجموع', 'اجمالي', 'إجمالي'].some(word => text.includes(normalizeSearchText(word)));
}

function answerAssistantQuestion(question, store) {
  const q = normalizeSearchText(question);
  const students = store.students || [];
  const subjects = store.subjects || [];
  const teachers = store.teachers || [];
  const schedules = store.teacherSchedules || [];
  const payments = store.payments || [];
  const logs = store.attendanceLogs || [];
  const creditStudents = students.filter(isCreditStudent);
  const totalCredit = creditStudents.reduce((sum, student) => sum + Number(student.creditAmount || 0), 0);
  const soonStudents = students.filter(student => student.paymentStatus === SOON);
  const todayLogs = logs.filter(log => log.scannedAt?.slice(0, 10) === todayISO());
  const student = findStudentByQuestion(question, students);
  const teacher = findTeacherByQuestion(question, teachers);
  const subject = findSubjectByQuestion(question, subjects);
  const requestedYear = SCHOOL_YEARS.find(year => q.includes(normalizeSearchText(year)));

  if (!q) return 'اكتب سؤالاً عن بيانات الجمعية وسأحلله لك.';

  if ((q.includes('كم') || q.includes('عدد')) && hasStudentWord(q) && !subject && !requestedYear) {
    return `عدد التلاميذ المسجلين حالياً هو: ${students.length}.`;
  }

  if ((q.includes('كريدي') || q.includes('لم يدفع') || q.includes('غير مدفوع')) && hasAmountWord(q)) {
    return `إجمالي مبالغ الكريديات الحالية هو ${money(totalCredit)}، وعدد التلاميذ المعنيين هو ${creditStudents.length}.`;
  }

  if (q.includes('كريدي') || q.includes('لم يدفع') || q.includes('غير مدفوع')) {
    return `التلاميذ الموجودون في الكريديات أو غير المدفوعين:\n${listLines(creditStudents.map(studentLine), 'لا يوجد تلاميذ في الكريديات حالياً.')}\n\nالإجمالي: ${money(totalCredit)}.`;
  }

  if (q.includes('تنتهي') || q.includes('قريبا') || q.includes('قريب')) {
    return `الاشتراكات التي ستنتهي قريباً:\n${listLines(soonStudents.map(student => `${studentLine(student)} - تاريخ الانتهاء: ${dateText(student.expiryDate)}`), 'لا توجد اشتراكات تنتهي قريباً حالياً.')}`;
  }

  if ((q.includes('دخل') || q.includes('حضور') || q.includes('qr')) && q.includes('اليوم')) {
    return `عمليات الدخول اليوم عبر QR: ${todayLogs.length}\n${listLines(todayLogs.map(log => `${log.studentName} - ${dateTimeText(log.scannedAt)} - ${log.paymentStatus}`), 'لا توجد عمليات دخول مسجلة اليوم.')}`;
  }

  if (requestedYear && (q.includes('قائمه') || q.includes('قائمة') || q.includes('تلاميذ') || q.includes('السنه') || q.includes('السنة'))) {
    const yearStudents = students.filter(item => item.level === requestedYear);
    return `تلاميذ ${requestedYear}: ${yearStudents.length}\n${listLines(yearStudents.map(studentLine), 'لا يوجد تلاميذ في هذه السنة حالياً.')}`;
  }

  if (subject) {
    const subjectRows = store.studentSubjects.filter(link => link.subjectId === subject.id);
    const subjectStudents = subjectRows.map(link => students.find(student => student.id === link.studentId)).filter(Boolean);
    const subjectTeachers = teachers.filter(item => item.subjectIds.includes(subject.id));
    if (q.includes('عدد')) {
      return `عدد التلاميذ المسجلين في ${subject.name}: ${subjectStudents.length}.\nالأساتذة المرتبطون بالمادة: ${subjectTeachers.length ? subjectTeachers.map(t => t.fullName).join('، ') : 'لا يوجد أساتذة بعد.'}`;
    }
    return `مادة ${subject.name}:\nالتلاميذ:\n${listLines(subjectStudents.map(studentLine), 'لا يوجد تلاميذ مسجلون في هذه المادة.')}\n\nالأساتذة:\n${listLines(subjectTeachers.map(item => `${item.fullName}${item.phone ? ` - ${item.phone}` : ''}`), 'لا يوجد أساتذة مرتبطون بهذه المادة.')}`;
  }

  if (teacher && q.includes('برنامج')) {
    const teacherSchedules = schedules.filter(schedule => schedule.teacherId === teacher.id);
    return `برنامج الأستاذ/ة ${teacher.fullName}:\n${listLines(teacherSchedules.map(schedule => {
      const scheduleSubject = subjects.find(item => item.id === schedule.subjectId);
      return `${schedule.day || 'يوم غير محدد'} ${schedule.startTime || '--:--'}-${schedule.endTime || '--:--'} | ${scheduleSubject?.name || 'مادة غير محددة'} | ${schedule.level || 'سنة غير محددة'} | ${schedule.group || 'فوج غير محدد'} | ${schedule.room || 'بدون قاعة'}`;
    }), 'لا توجد حصص مسجلة لهذا الأستاذ حالياً.')}`;
  }

  if (teacher) {
    const teacherSubjects = teacher.subjectIds.map(id => subjects.find(subject => subject.id === id)?.name).filter(Boolean);
    const teacherSchedules = schedules.filter(schedule => schedule.teacherId === teacher.id);
    return `الأستاذ/ة ${teacher.fullName}:\nالهاتف: ${teacher.phone || 'غير محدد'}\nالمواد: ${teacherSubjects.length ? teacherSubjects.join('، ') : 'غير محددة'}\nعدد الحصص الأسبوعية: ${teacherSchedules.length}\nالأفواج: ${teacher.groups.length ? teacher.groups.join('، ') : 'غير محددة'}`;
  }

  if (student) {
    const rows = getStudentAcademicRows(student.id, store);
    if (q.includes('مدفوع') || q.includes('الدفع') || q.includes('الحاله') || q.includes('الحالة')) {
      return `حالة التلميذ ${student.fullName}: ${isCreditStudent(student) ? CREDIT : student.paymentStatus}.\nآخر دفع: ${dateText(student.lastPaymentDate)}\nانتهاء الاشتراك: ${dateText(student.expiryDate)}\nالكريدي: ${money(student.creditAmount || 0)}.`;
    }
    if (q.includes('ينتهي') || q.includes('نهايه') || q.includes('نهاية') || q.includes('اشتراك')) {
      return `اشتراك ${student.fullName} ينتهي في: ${dateText(student.expiryDate)}.\nالحالة الحالية: ${isCreditStudent(student) ? CREDIT : student.paymentStatus}.`;
    }
    if (q.includes('مواد') || q.includes('يدرس')) {
      return `مواد التلميذ ${student.fullName}:\n${listLines(rows.map(row => `${row.subject?.name || 'مادة غير محددة'} مع ${row.teacher?.fullName || 'أستاذ غير محدد'} - ${timeRange(row.schedule)}`), 'لا توجد مواد مسجلة لهذا التلميذ.')}`;
    }
    return `ملخص ${student.fullName}:\nالسنة: ${student.level || 'غير محددة'}\nالفوج: ${student.group || 'غير محدد'}\nحالة الدفع: ${isCreditStudent(student) ? CREDIT : student.paymentStatus}\nالمواد: ${rows.length ? rows.map(row => row.subject?.name).filter(Boolean).join('، ') : 'لا توجد مواد'}\nتاريخ التسجيل: ${dateText(student.registrationDate)}`;
  }

  if (q.includes('اقتراح') || q.includes('ملاحظات') || q.includes('ملخص') || q.includes('احصائيات') || q.includes('إحصائيات')) {
    return buildAssistantInsights(store);
  }

  return `لم أجد سؤالاً محدداً بما يكفي، لكن هذا ملخص سريع:\n${buildAssistantInsights(store)}\n\nيمكنك أن تسأل مثلاً: "من لم يدفع؟"، "ما برنامج الأستاذ أحمد؟"، "كم عدد تلاميذ الفرنسية؟"، أو "ما مواد التلميذ محمد؟".`;
}

function buildAssistantInsights(store) {
  const students = store.students || [];
  const creditStudents = students.filter(isCreditStudent);
  const totalCredit = creditStudents.reduce((sum, student) => sum + Number(student.creditAmount || 0), 0);
  const soonStudents = students.filter(student => student.paymentStatus === SOON);
  const yearCounts = SCHOOL_YEARS.map(year => ({ year, count: students.filter(student => student.level === year).length })).sort((a, b) => b.count - a.count);
  const topYear = yearCounts[0];
  const teacherLoads = store.teachers.map(teacher => ({ teacher, count: store.teacherSchedules.filter(schedule => schedule.teacherId === teacher.id).length })).sort((a, b) => b.count - a.count);
  const topTeacher = teacherLoads[0];
  return [
    `عدد التلاميذ المسجلين: ${students.length}.`,
    `عدد التلاميذ في الكريديات: ${creditStudents.length}.`,
    `مجموع الكريديات الحالية: ${money(totalCredit)}.`,
    `الاشتراكات التي تنتهي قريباً: ${soonStudents.length}.`,
    `أكثر سنة تسجيلاً: ${topYear && topYear.count > 0 ? `${topYear.year} (${topYear.count})` : 'لا توجد بيانات كافية بعد'}.`,
    `أكثر أستاذ لديه حصص: ${topTeacher && topTeacher.count > 0 ? `${topTeacher.teacher.fullName} (${topTeacher.count})` : 'لا توجد برامج أساتذة بعد'}.`
  ].join('\n');
}

function playTone(type, enabled) {
  if (!enabled) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  const ctx = new Audio();
  const sequence = type === 'success'
    ? [{ f: 660, t: 0.08 }, { f: 920, t: 0.1 }]
    : type === 'invalid'
      ? [{ f: 260, t: 0.12 }, { f: 180, t: 0.16 }]
      : [{ f: 180, t: 0.18 }, { f: 140, t: 0.22 }, { f: 180, t: 0.18 }];
  let at = ctx.currentTime;
  sequence.forEach(({ f, t }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = f;
    osc.type = type === 'success' ? 'sine' : 'square';
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.18, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + t);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + t);
    at += t + 0.04;
  });
}

function App() {
  const [store, setStore] = useState(() => normalizeStore(emptyStore));
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [firebaseError, setFirebaseError] = useState('');
  const [page, setPage] = useState('dashboard');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (!currentUser) {
        setStore(normalizeStore(emptyStore));
        setDataLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    setDoc(doc(db, 'admins', user.uid), {
      id: user.uid,
      email: user.email || '',
      name: user.displayName || user.email || '',
      lastLoginAt: serverTimestamp()
    }, { merge: true }).catch((error) => setFirebaseError(error.message));
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    setDataLoading(true);
    setFirebaseError('');
    let nextStore = normalizeStore(emptyStore);
    const loaded = new Set();
    const collections = [...FIRESTORE_COLLECTIONS, 'credits'];
    const requiredSnapshots = collections.length + 1;
    const markLoaded = (key) => {
      loaded.add(key);
      if (loaded.size >= requiredSnapshots) setDataLoading(false);
    };
    const applyStore = () => setStore(normalizeStore(nextStore));
    const onError = (error) => {
      setFirebaseError(error.message);
      setDataLoading(false);
    };

    const unsubscribers = collections.map(collectionName => onSnapshot(
      collection(db, collectionName),
      (snapshot) => {
        nextStore = {
          ...nextStore,
          [collectionName]: snapshot.docs.map(readFirestoreDoc)
        };
        markLoaded(collectionName);
        applyStore();
      },
      onError
    ));

    unsubscribers.push(onSnapshot(
      doc(db, 'settings', 'app'),
      (snapshot) => {
        nextStore = {
          ...nextStore,
          settings: snapshot.exists() ? readFirestoreDoc(snapshot) : emptyStore.settings
        };
        markLoaded('settings');
        applyStore();
      },
      onError
    ));

    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [user]);

  useEffect(() => {
    if (!store.students.length) return;
    setSelectedStudentId(current => current && store.students.some(student => student.id === current) ? current : store.students[0].id);
  }, [store.students]);

  useEffect(() => {
    if (!store.teachers.length) return;
    setSelectedTeacherId(current => current && store.teachers.some(teacher => teacher.id === current) ? current : store.teachers[0].id);
  }, [store.teachers]);

  const studentsWithStatus = useMemo(
    () => store.students.map(s => ({ ...s, paymentStatus: getPaymentStatus(s, store.settings) })),
    [store.students, store.settings]
  );
  const viewStore = useMemo(() => ({ ...store, students: studentsWithStatus }), [store, studentsWithStatus]);
  const selectedStudent = selectedStudentId === 'new'
    ? { id: 'new' }
    : studentsWithStatus.find(s => s.id === selectedStudentId) || studentsWithStatus[0];
  const pageTitle = page === 'student-form'
    ? (selectedStudentId === 'new' ? 'إضافة تلميذ' : 'تعديل تلميذ')
    : page === 'student-profile'
      ? 'ملف التلميذ'
      : navItems.find(i => i.id === page)?.label || 'لوحة التحكم';

  const updateStore = (recipe) => setStore(prev => {
    const next = structuredClone(prev);
    recipe(next);
    const normalized = normalizeStore(next);
    persistStoreChanges(prev, normalized).catch((error) => setFirebaseError(error.message));
    return normalized;
  });

  const handleLogout = () => {
    signOut(auth).catch((error) => setFirebaseError(error.message));
    setPage('dashboard');
  };

  if (authLoading) return <LoadingScreen text="جار التحقق من جلسة الإدارة..." />;
  if (!user) return <Login onLogin={(email, password) => signInWithEmailAndPassword(auth, email.trim(), password)} />;
  if (dataLoading) return <LoadingScreen text="جار تحميل بيانات الجمعية من Firebase..." error={firebaseError} />;

  return (
    <div className="appShell">
      <Sidebar page={page} setPage={setPage} onLogout={handleLogout} associationName={store.settings.associationName} logo={store.settings.logo} />
      <main className="mainPanel">
        <Topbar title={pageTitle} settings={store.settings} user={user} />
        {firebaseError && <div className="firebaseNotice">{firebaseError}</div>}
        {page === 'dashboard' && <Dashboard store={viewStore} setPage={setPage} selectStudent={setSelectedStudentId} />}
        {page === 'students' && <StudentsPage store={viewStore} updateStore={updateStore} setPage={setPage} setSelectedStudentId={setSelectedStudentId} />}
        {page === 'student-profile' && <StudentProfile student={selectedStudent} store={viewStore} setPage={setPage} setSelectedStudentId={setSelectedStudentId} />}
        {page === 'student-form' && <StudentForm student={selectedStudent} store={viewStore} updateStore={updateStore} setPage={setPage} setSelectedStudentId={setSelectedStudentId} />}
        {page === 'subjects' && <SubjectsPage store={viewStore} updateStore={updateStore} />}
        {page === 'teachers' && <TeachersPage store={viewStore} updateStore={updateStore} setPage={setPage} setSelectedTeacherId={setSelectedTeacherId} />}
        {page === 'teacher-programs' && <TeacherProgramsPage store={viewStore} updateStore={updateStore} selectedTeacherId={selectedTeacherId} setSelectedTeacherId={setSelectedTeacherId} />}
        {page === 'payments' && <PaymentsPage store={viewStore} updateStore={updateStore} selectedStudentId={selectedStudent?.id} setSelectedStudentId={setSelectedStudentId} />}
        {page === 'credits' && <CreditsPage store={viewStore} updateStore={updateStore} setPage={setPage} setSelectedStudentId={setSelectedStudentId} />}
        {page === 'card' && <QrCardPage student={selectedStudent} store={viewStore} />}
        {page === 'scanner' && <ScannerPage store={viewStore} updateStore={updateStore} />}
        {page === 'logs' && <LogsPage store={viewStore} />}
        {page === 'reports' && <ReportsPage store={viewStore} />}
        {page === 'assistant' && <SmartAssistantPage store={viewStore} />}
        {page === 'settings' && <SettingsPage settings={store.settings} updateStore={updateStore} />}
      </main>
    </div>
  );
}

function LoadingScreen({ text, error }) {
  return (
    <div className="loginPage">
      <div className="loginBox">
        <div className="brandMark"><ShieldCheck size={34} /></div>
        <h1>{text}</h1>
        {error && <div className="errorLine">{error}</div>}
      </div>
    </div>
  );
}

const navItems = [
  { id: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { id: 'students', label: 'التلاميذ', icon: Users },
  { id: 'credits', label: 'الكريديات', icon: Bell },
  { id: 'payments', label: 'المدفوعات', icon: CreditCard },
  { id: 'subjects', label: 'المواد', icon: BookOpen },
  { id: 'teachers', label: 'الأساتذة', icon: UserRound },
  { id: 'teacher-programs', label: 'برامج الأساتذة', icon: CalendarDays },
  { id: 'card', label: 'بطاقة QR', icon: QrCode },
  { id: 'scanner', label: 'ماسح QR', icon: Camera },
  { id: 'logs', label: 'سجل الدخول', icon: History },
  { id: 'reports', label: 'التقارير', icon: CalendarClock },
  { id: 'assistant', label: 'المساعد الذكي', icon: Bot },
  { id: 'settings', label: 'الإعدادات', icon: Settings }
];

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err.code === 'auth/invalid-credential' ? 'بيانات الدخول غير صحيحة أو الحساب غير موجود في Firebase.' : err.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="loginPage">
      <form className="loginBox" onSubmit={submit}>
        <div className="brandMark"><ShieldCheck size={34} /></div>
        <h1>نظام إدارة جمعية الدعم الدراسي</h1>
        <p>تسجيل دخول الإدارة عبر Firebase Authentication</p>
        <label>البريد الإلكتروني<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
        <label>كلمة المرور<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /></label>
        {error && <div className="errorLine">{error}</div>}
        <button className="primaryBtn" disabled={loading}><LogIn size={18} /> {loading ? 'جار الدخول...' : 'دخول'}</button>
      </form>
    </div>
  );
}

function Sidebar({ page, setPage, onLogout, associationName, logo }) {
  return (
    <aside className="sidebar">
      <div className="identity">
        {logo ? <img src={logo} alt="" /> : <GraduationCap />}
        <div><strong>{associationName}</strong><span>إدارة التلاميذ والمواد والأساتذة</span></div>
      </div>
      <nav>
        {navItems.map(item => {
          const Icon = item.icon;
          return <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)}><Icon size={19} />{item.label}</button>;
        })}
      </nav>
      <button className="logoutBtn" onClick={onLogout}><LogOut size={18} /> خروج</button>
    </aside>
  );
}

function Topbar({ title, settings, user }) {
  const displayName = user?.displayName || user?.email || 'مدير النظام';
  return (
    <header className="topbar">
      <div><h2>{title}</h2><p>{settings.associationName}</p></div>
      <div className="topbarActions">
        <button className="iconButton" title="الإشعارات"><Bell size={18} /></button>
        <div className="adminChip"><div className="adminAvatar">{displayName.slice(0, 1)}</div><span>{displayName}</span></div>
        <button className="iconButton menuButton" title="القائمة"><LayoutDashboard size={18} /></button>
      </div>
    </header>
  );
}

function Dashboard({ store, setPage, selectStudent }) {
  const { students, payments, attendanceLogs, subjects, teachers, teacherSchedules } = store;
  const paid = students.filter(s => s.paymentStatus === PAID).length;
  const soon = students.filter(s => s.paymentStatus === SOON).length;
  const creditStudents = students.filter(isCreditStudent);
  const totalCredit = creditStudents.reduce((sum, s) => sum + Number(s.creditAmount || 0), 0);
  const todayLogs = attendanceLogs.filter(l => l.scannedAt?.slice(0, 10) === todayISO()).length;
  const recent = [...attendanceLogs].sort((a, b) => new Date(b.scannedAt) - new Date(a.scannedAt)).slice(0, 6);
  const primary = students.filter(s => s.level?.includes('ابتدائي')).length;
  const middle = students.filter(s => s.level?.includes('متوسط')).length;
  const secondary = students.filter(s => s.level?.includes('ثانوي')).length;
  const totalStages = Math.max(students.length, 1);
  const donutStyle = {
    background: `conic-gradient(#0B63E5 0 ${(primary / totalStages) * 100}%, #16A3A3 ${(primary / totalStages) * 100}% ${((primary + middle) / totalStages) * 100}%, #F59E0B ${((primary + middle) / totalStages) * 100}% 100%)`
  };
  const hourCounts = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'].map((hour, index) => ({
    hour,
    count: todayLogs ? Math.max(1, Math.round((todayLogs * (index + 1)) / 6)) : 0
  }));
  const maxHour = Math.max(...hourCounts.map(item => item.count), 1);
  const cards = [
    ['إجمالي التلاميذ', students.length, Users, '+ 12%'],
    ['الدافعون', paid, CheckCircle2, '+ 8%'],
    ['غير دافعين (كريديات)', creditStudents.length, XCircle, `المجموع ${money(totalCredit)}`],
    ['تنتهي قريباً', soon, CalendarClock, 'خلال فترة التنبيه']
  ];
  return (
    <section className="pageGrid">
      <div className="dashboardStats">
        {cards.map(([label, value, Icon, hint]) => <article className="statCard" key={label}><div className="statIcon"><Icon size={23} /></div><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>)}
      </div>
      <div className="assistantCta">
        <div>
          <Sparkles size={26} />
          <h3>اسأل المساعد الذكي</h3>
          <p>استعلم عن التلاميذ، الكريديات، المواد، الأساتذة، البرامج، وسجلات QR اعتماداً على بيانات التطبيق الحالية.</p>
        </div>
        <button className="primaryBtn" onClick={() => setPage('assistant')}><Bot size={18} /> فتح الدردشة</button>
      </div>
      <div className="dashboardCharts">
        <div className="widePanel chartCard">
          <div className="panelHeader"><h3>توزيع التلاميذ حسب السنوات</h3><button onClick={() => setPage('reports')}>التقارير</button></div>
          <div className="donutWrap">
            <div className="donutChart" style={donutStyle}><span>{students.length}</span><small>تلميذ</small></div>
            <div className="legendList">
              <div><i className="blueDot" /> ابتدائي <b>{primary}</b></div>
              <div><i className="tealDot" /> متوسط <b>{middle}</b></div>
              <div><i className="orangeDot" /> ثانوي <b>{secondary}</b></div>
            </div>
          </div>
        </div>
        <div className="widePanel chartCard">
          <div className="panelHeader"><h3>عمليات الدخول اليوم</h3><strong>{todayLogs}</strong></div>
          <div className="lineChart">
            {hourCounts.map(item => <div key={item.hour} className="linePoint"><span style={{ height: `${20 + (item.count / maxHour) * 74}%` }} /><small>{item.hour}</small></div>)}
          </div>
        </div>
      </div>
      <div className="widePanel">
        <div className="panelHeader"><h3>آخر عمليات الدخول</h3><button onClick={() => setPage('logs')}>عرض السجل</button></div>
        <div className="tableWrap">
          <table className="dashboardTable">
            <thead><tr><th>التلميذ</th><th>الوقت</th><th>الحالة</th></tr></thead>
            <tbody>{recent.map(log => <tr key={log.id} onClick={() => { selectStudent(log.studentId); setPage('student-profile'); }}><td><StudentMini student={students.find(s => s.id === log.studentId) || { fullName: log.studentName }} /></td><td>{dateTimeText(log.scannedAt)}</td><td><Status status={log.paymentStatus} /></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function StudentsPage({ store, updateStore, setPage, setSelectedStudentId }) {
  const { students, subjects, teachers } = store;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(ALL);
  const [group, setGroup] = useState(ALL);
  const [year, setYear] = useState(ALL);
  const [subjectId, setSubjectId] = useState(ALL);
  const [teacherId, setTeacherId] = useState(ALL);
  const groups = [ALL, ...new Set(students.map(s => s.group).filter(Boolean))];
  const filtered = students.filter(student => {
    const rows = getStudentAcademicRows(student.id, store);
    const subjectNames = rows.map(row => row.subject?.name).filter(Boolean).join(' ');
    const teacherNames = rows.map(row => row.teacher?.fullName).filter(Boolean).join(' ');
    const hit = [student.fullName, student.phone, student.level, subjectNames, teacherNames].join(' ').toLowerCase().includes(q.toLowerCase());
    return hit
      && (status === ALL || student.paymentStatus === status)
      && (group === ALL || student.group === group)
      && (year === ALL || student.level === year)
      && (subjectId === ALL || rows.some(row => row.subjectId === subjectId))
      && (teacherId === ALL || rows.some(row => row.teacherId === teacherId));
  });
  const openProfile = (id) => { setSelectedStudentId(id); setPage('student-profile'); };
  const edit = (id) => { setSelectedStudentId(id); setPage('student-form'); };
  const remove = (id) => {
    if (!confirm('هل تريد حذف هذا التلميذ وكل سجلاته؟')) return;
    updateStore(s => {
      s.students = s.students.filter(x => x.id !== id);
      s.payments = s.payments.filter(x => x.studentId !== id);
      s.attendanceLogs = s.attendanceLogs.filter(x => x.studentId !== id);
      s.studentSubjects = s.studentSubjects.filter(x => x.studentId !== id);
    });
  };
  return (
    <section className="pageGrid">
      <div className="yearCards">
        <button className={year === ALL ? 'active' : ''} onClick={() => setYear(ALL)}><strong>{students.length}</strong><span>كل السنوات</span></button>
        {SCHOOL_YEARS.map(item => <button key={item} className={year === item ? 'active' : ''} onClick={() => setYear(item)}><strong>{students.filter(s => s.level === item).length}</strong><span>{item}</span></button>)}
      </div>
      <section className="panel">
        <div className="toolbar">
          <div className="searchBox"><Search size={18} /><input placeholder="بحث بالاسم أو الهاتف أو المادة أو الأستاذ" value={q} onChange={e => setQ(e.target.value)} /></div>
          <select value={status} onChange={e => setStatus(e.target.value)}><option>{ALL}</option><option>{PAID}</option><option>{UNPAID}</option><option>{EXPIRED}</option><option>{SOON}</option></select>
          <select value={subjectId} onChange={e => setSubjectId(e.target.value)}><option value={ALL}>كل المواد</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select value={teacherId} onChange={e => setTeacherId(e.target.value)}><option value={ALL}>كل الأساتذة</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}</select>
          <select value={group} onChange={e => setGroup(e.target.value)}>{groups.map(x => <option key={x}>{x}</option>)}</select>
          <button className="primaryBtn" onClick={() => { setSelectedStudentId('new'); setPage('student-form'); }}><Plus size={18} /> إضافة</button>
        </div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>التلميذ</th><th>الهاتف</th><th>السنة</th><th>الفوج</th><th>المواد</th><th>الحالة</th><th></th></tr></thead>
            <tbody>
              {filtered.map(student => {
                const rows = getStudentAcademicRows(student.id, store);
                return <tr key={student.id}><td><StudentMini student={student} /></td><td>{student.phone}</td><td>{student.level}</td><td>{student.group}</td><td><ChipList items={rows.map(row => row.subject?.name).filter(Boolean)} empty="لا توجد مواد" /></td><td><Status status={student.paymentStatus} /></td><td className="rowActions"><button title="عرض الملف" onClick={() => openProfile(student.id)}><Eye size={16} /></button><button title="تعديل" onClick={() => edit(student.id)}><Edit3 size={16} /></button><button title="حذف" onClick={() => remove(student.id)}><Trash2 size={16} /></button></td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function StudentProfile({ student, store, setPage, setSelectedStudentId }) {
  const rows = student?.id ? getStudentAcademicRows(student.id, store) : [];
  if (!student || student.id === 'new') return <section className="panel">لا يوجد تلميذ محدد</section>;
  return (
    <section className="profileGrid">
      <div className="panel profileHero">
        <StudentMini student={student} />
        <Status status={isCreditStudent(student) ? CREDIT : student.paymentStatus} />
        <div className="profileFacts">
          <span>السنة: <b>{student.level || 'غير محدد'}</b></span>
          <span>الفوج: <b>{student.group || 'غير محدد'}</b></span>
          <span>تاريخ التسجيل: <b>{dateText(student.registrationDate)}</b></span>
          <span>انتهاء الاشتراك: <b>{dateText(student.expiryDate)}</b></span>
        </div>
        <div className="buttonRow">
          <button className="primaryBtn" onClick={() => { setSelectedStudentId(student.id); setPage('student-form'); }}><Edit3 size={18} /> تعديل الملف</button>
          <button onClick={() => setPage('card')}><QrCode size={18} /> بطاقة QR</button>
        </div>
      </div>
      <div className="panel">
        <h3>البيانات الشخصية</h3>
        <div className="detailGrid">
          <span>الهاتف<b>{student.phone || 'غير محدد'}</b></span>
          <span>اسم الولي<b>{student.guardianName || 'غير محدد'}</b></span>
          <span>هاتف الولي<b>{student.guardianPhone || 'غير محدد'}</b></span>
          <span>ملاحظات<b>{student.notes || 'لا توجد ملاحظات'}</b></span>
        </div>
      </div>
      <div className="panel fullSpan">
        <div className="profileTabs"><button className="active">المعلومات</button><button>المواد</button><button>المدفوعات</button><button>الملاحظات</button></div>
        <div className="panelHeader"><h3>السجل الدراسي والمواد</h3><button onClick={() => { setSelectedStudentId(student.id); setPage('student-form'); }}><Plus size={18} /> تعديل المواد</button></div>
        <AcademicTable rows={rows} />
      </div>
    </section>
  );
}

function StudentForm({ student, store, updateStore, setPage, setSelectedStudentId }) {
  const isNew = !student || student.id === 'new';
  const [draftId] = useState(() => isNew ? uid('stu') : student.id);
  const [form, setForm] = useState(isNew ? {
    fullName: '',
    phone: '',
    guardianName: '',
    guardianPhone: '',
    level: '',
    group: '',
    registrationDate: '',
    lastPaymentDate: '',
    expiryDate: '',
    creditAmount: '',
    debtStartDate: '',
    lastReminderDate: '',
    creditNotes: '',
    photo: '',
    notes: ''
  } : hydrateStudent(student));
  const [links, setLinks] = useState(isNew ? [] : store.studentSubjects.filter(link => link.studentId === student.id));
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const updateLink = (id, key, value) => setLinks(prev => prev.map(link => link.id === id ? { ...link, [key]: value, ...(key === 'teacherId' ? { scheduleId: '' } : {}) } : link));
  const addLink = () => setLinks(prev => [...prev, hydrateStudentSubject({ id: uid('draft'), studentId: student?.id || '' })]);
  const removeLink = (id) => setLinks(prev => prev.filter(link => link.id !== id));
  const handlePhotoUpload = async (file) => {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadFileToStorage(`students/${draftId}`, file);
      set('photo', url);
    } catch (error) {
      alert(`تعذر رفع صورة التلميذ: ${error.message}`);
    } finally {
      setUploadingPhoto(false);
    }
  };
  const save = (e) => {
    e.preventDefault();
    const savedId = isNew ? draftId : form.id;
    const savedStudent = {
      ...form,
      id: savedId,
      level: normalizeYear(form.level),
      creditAmount: Number(form.creditAmount || 0),
      secureId: isNew ? uid('qr') : form.secureId,
      registrationNumber: isNew ? `REG-${new Date().getFullYear()}-${String(store.students.length + 1).padStart(3, '0')}` : form.registrationNumber
    };
    updateStore(s => {
      if (isNew) s.students.unshift(savedStudent);
      else s.students = s.students.map(x => x.id === savedId ? savedStudent : x);
      s.studentSubjects = s.studentSubjects.filter(link => link.studentId !== savedId);
      links.filter(link => link.subjectId).forEach(link => {
        s.studentSubjects.push({
          id: link.id.startsWith('draft') ? uid('ssub') : link.id,
          studentId: savedId,
          subjectId: link.subjectId,
          teacherId: link.teacherId,
          scheduleId: link.scheduleId,
          note: link.note || ''
        });
      });
    });
    setSelectedStudentId(savedId);
    setPage('student-profile');
  };
  return (
    <form className="panel formPanel" onSubmit={save}>
      <div className="panelHeader"><h3>{isNew ? 'إضافة تلميذ جديد' : 'تعديل بيانات التلميذ'}</h3><button type="button" onClick={() => setPage('students')}>رجوع</button></div>
      <div className="formGrid">
        <Input label="الاسم الكامل" value={form.fullName} onChange={v => set('fullName', v)} required />
        <Input label="رقم الهاتف" value={form.phone} onChange={v => set('phone', v)} />
        <Input label="اسم الولي" value={form.guardianName} onChange={v => set('guardianName', v)} />
        <Input label="هاتف الولي" value={form.guardianPhone} onChange={v => set('guardianPhone', v)} />
        <label>السنة الدراسية<select value={form.level} required onChange={e => set('level', e.target.value)}><option value="">اختر السنة الدراسية</option>{SCHOOL_YEARS.map(year => <option key={year}>{year}</option>)}</select></label>
        <Input label="المجموعة أو الفوج" value={form.group} onChange={v => set('group', v)} />
        <Input type="date" label="تاريخ التسجيل" value={form.registrationDate} onChange={v => set('registrationDate', v)} />
        <Input type="date" label="تاريخ آخر دفع" value={form.lastPaymentDate} onChange={v => set('lastPaymentDate', v)} />
        <Input type="date" label="تاريخ انتهاء الاشتراك" value={form.expiryDate} onChange={v => set('expiryDate', v)} />
        <Input type="number" label="المبلغ المطلوب في الكريدي" value={form.creditAmount} onChange={v => set('creditAmount', v)} />
        <Input type="date" label="تاريخ بداية الدين" value={form.debtStartDate} onChange={v => set('debtStartDate', v)} />
        <Input type="date" label="تاريخ آخر تذكير" value={form.lastReminderDate} onChange={v => set('lastReminderDate', v)} />
        <label className="fileInput"><Upload size={18} /> {uploadingPhoto ? 'جار رفع الصورة...' : 'صورة اختيارية'}<input type="file" accept="image/*" onChange={e => handlePhotoUpload(e.target.files?.[0])} /></label>
        <label className="full">ملاحظات خاصة بالتلميذ<textarea value={form.notes} onChange={e => set('notes', e.target.value)} /></label>
        <label className="full">ملاحظات الكريدي<textarea value={form.creditNotes} onChange={e => set('creditNotes', e.target.value)} /></label>
      </div>
      <section className="academicEditor">
        <div className="panelHeader"><h3>السجل الدراسي والمواد</h3><button type="button" onClick={addLink}><Plus size={18} /> إضافة مادة</button></div>
        {links.map(link => <AcademicEditorRow key={link.id} link={link} form={form} store={store} updateLink={updateLink} removeLink={removeLink} />)}
        {!links.length && <p className="mutedLine">لا توجد مواد مسجلة بعد. أضف مادة واربطها بالأستاذ والحصة.</p>}
      </section>
      <button className="primaryBtn saveBtn">حفظ البيانات</button>
    </form>
  );
}

function AcademicEditorRow({ link, form, store, updateLink, removeLink }) {
  const teachers = link.subjectId ? store.teachers.filter(t => t.subjectIds.includes(link.subjectId)) : store.teachers;
  const schedules = store.teacherSchedules.filter(schedule => {
    return (!link.teacherId || schedule.teacherId === link.teacherId)
      && (!link.subjectId || schedule.subjectId === link.subjectId)
      && (!form.level || !schedule.level || schedule.level === form.level)
      && (!form.group || !schedule.group || schedule.group === form.group);
  });
  return (
    <div className="academicRow">
      <label>المادة<select value={link.subjectId} onChange={e => updateLink(link.id, 'subjectId', e.target.value)}><option value="">اختر المادة</option>{store.subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
      <label>الأستاذ<select value={link.teacherId} onChange={e => updateLink(link.id, 'teacherId', e.target.value)}><option value="">اختر الأستاذ</option>{teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}</select></label>
      <label>الحصة<select value={link.scheduleId} onChange={e => updateLink(link.id, 'scheduleId', e.target.value)}><option value="">اختر الحصة</option>{schedules.map(schedule => <option key={schedule.id} value={schedule.id}>{timeRange(schedule)} - {schedule.room || 'بدون قاعة'}</option>)}</select></label>
      <Input label="ملاحظة" value={link.note} onChange={v => updateLink(link.id, 'note', v)} />
      <button type="button" onClick={() => removeLink(link.id)}><Trash2 size={16} /> حذف</button>
    </div>
  );
}

function SubjectsPage({ store, updateStore }) {
  const [form, setForm] = useState({ name: '', notes: '' });
  const [editId, setEditId] = useState('');
  const [q, setQ] = useState('');
  const filtered = store.subjects.filter(subject => [subject.name, subject.notes].join(' ').toLowerCase().includes(q.toLowerCase()));
  const save = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    updateStore(s => {
      if (editId) s.subjects = s.subjects.map(subject => subject.id === editId ? { ...subject, ...form } : subject);
      else s.subjects.push({ id: uid('sub'), ...form });
    });
    setForm({ name: '', notes: '' });
    setEditId('');
  };
  const addSuggestion = (name) => {
    if (store.subjects.some(subject => subject.name === name)) return;
    updateStore(s => s.subjects.push({ id: uid('sub'), name, notes: '' }));
  };
  const edit = (subject) => { setForm({ name: subject.name, notes: subject.notes || '' }); setEditId(subject.id); };
  const remove = (subject) => {
    const linked = store.studentSubjects.some(link => link.subjectId === subject.id)
      || store.teacherSchedules.some(schedule => schedule.subjectId === subject.id)
      || store.teachers.some(teacher => teacher.subjectIds.includes(subject.id));
    if (linked) return alert('لا يمكن حذف مادة مرتبطة بتلاميذ أو أساتذة أو حصص.');
    updateStore(s => { s.subjects = s.subjects.filter(x => x.id !== subject.id); });
  };
  return (
    <section className="twoCols">
      <form className="panel" onSubmit={save}>
        <h3>{editId ? 'تعديل مادة' : 'إضافة مادة'}</h3>
        <Input label="اسم المادة" value={form.name} onChange={v => setForm(prev => ({ ...prev, name: v }))} required />
        <label>ملاحظات<textarea value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} /></label>
        <button className="primaryBtn">{editId ? 'حفظ التعديل' : 'إضافة المادة'}</button>
        <div className="suggestions"><span>اقتراحات سريعة</span>{SUBJECT_SUGGESTIONS.map(name => <button type="button" key={name} onClick={() => addSuggestion(name)}>{name}</button>)}</div>
      </form>
      <div className="panel">
        <div className="toolbar compact"><div className="searchBox"><Search size={18} /><input placeholder="بحث عن مادة" value={q} onChange={e => setQ(e.target.value)} /></div></div>
        <div className="listCards">
          {filtered.map(subject => <article key={subject.id}><div><strong>{subject.name}</strong><span>{subject.notes || 'لا توجد ملاحظات'}</span></div><div className="rowActions"><button onClick={() => edit(subject)}><Edit3 size={16} /></button><button onClick={() => remove(subject)}><Trash2 size={16} /></button></div></article>)}
        </div>
      </div>
    </section>
  );
}

function TeachersPage({ store, updateStore, setPage, setSelectedTeacherId }) {
  const [form, setForm] = useState({ fullName: '', phone: '', subjectIds: [], levels: [], groupsText: '', notes: '' });
  const [editId, setEditId] = useState('');
  const [q, setQ] = useState('');
  const [subjectId, setSubjectId] = useState(ALL);
  const [level, setLevel] = useState(ALL);
  const filtered = store.teachers.filter(teacher => {
    const subjectNames = teacher.subjectIds.map(id => store.subjects.find(s => s.id === id)?.name).filter(Boolean).join(' ');
    const hit = [teacher.fullName, teacher.phone, subjectNames].join(' ').toLowerCase().includes(q.toLowerCase());
    return hit && (subjectId === ALL || teacher.subjectIds.includes(subjectId)) && (level === ALL || teacher.levels.includes(level));
  });
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const toggleIn = (key, value) => setForm(prev => ({ ...prev, [key]: prev[key].includes(value) ? prev[key].filter(x => x !== value) : [...prev[key], value] }));
  const save = (e) => {
    e.preventDefault();
    if (!form.fullName.trim()) return;
    const teacher = {
      id: editId || uid('tea'),
      fullName: form.fullName,
      phone: form.phone,
      subjectIds: form.subjectIds,
      levels: form.levels,
      groups: form.groupsText.split(',').map(x => x.trim()).filter(Boolean),
      notes: form.notes
    };
    updateStore(s => {
      if (editId) s.teachers = s.teachers.map(x => x.id === editId ? teacher : x);
      else s.teachers.push(teacher);
    });
    setForm({ fullName: '', phone: '', subjectIds: [], levels: [], groupsText: '', notes: '' });
    setEditId('');
  };
  const edit = (teacher) => {
    setEditId(teacher.id);
    setForm({ fullName: teacher.fullName, phone: teacher.phone, subjectIds: teacher.subjectIds, levels: teacher.levels, groupsText: teacher.groups.join(', '), notes: teacher.notes });
  };
  const remove = (teacher) => {
    if (!confirm('هل تريد حذف الأستاذ وبرنامجه؟')) return;
    updateStore(s => {
      s.teachers = s.teachers.filter(x => x.id !== teacher.id);
      s.teacherSchedules = s.teacherSchedules.filter(x => x.teacherId !== teacher.id);
      s.studentSubjects = s.studentSubjects.map(link => link.teacherId === teacher.id ? { ...link, teacherId: '', scheduleId: '' } : link);
    });
  };
  const showProgram = (teacherId) => { setSelectedTeacherId(teacherId); setPage('teacher-programs'); };
  return (
    <section className="twoCols teacherLayout">
      <form className="panel" onSubmit={save}>
        <h3>{editId ? 'تعديل أستاذ' : 'إضافة أستاذ'}</h3>
        <Input label="الاسم الكامل" value={form.fullName} onChange={v => set('fullName', v)} required />
        <Input label="رقم الهاتف" value={form.phone} onChange={v => set('phone', v)} />
        <Picker title="المواد التي يدرسها" items={store.subjects.map(s => ({ id: s.id, label: s.name }))} selected={form.subjectIds} onToggle={value => toggleIn('subjectIds', value)} empty="أضف مواد من صفحة إدارة المواد أولاً" />
        <Picker title="السنوات التي يدرسها" items={SCHOOL_YEARS.map(year => ({ id: year, label: year }))} selected={form.levels} onToggle={value => toggleIn('levels', value)} />
        <Input label="الأفواج المرتبطة به، مفصولة بفواصل" value={form.groupsText} onChange={v => set('groupsText', v)} />
        <label>ملاحظات<textarea value={form.notes} onChange={e => set('notes', e.target.value)} /></label>
        <button className="primaryBtn">{editId ? 'حفظ التعديل' : 'إضافة الأستاذ'}</button>
      </form>
      <div className="panel">
        <div className="toolbar">
          <div className="searchBox"><Search size={18} /><input placeholder="بحث بالاسم أو المادة" value={q} onChange={e => setQ(e.target.value)} /></div>
          <select value={subjectId} onChange={e => setSubjectId(e.target.value)}><option value={ALL}>كل المواد</option>{store.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select value={level} onChange={e => setLevel(e.target.value)}><option>{ALL}</option>{SCHOOL_YEARS.map(year => <option key={year}>{year}</option>)}</select>
        </div>
        <div className="listCards">
          {filtered.map(teacher => <article key={teacher.id}>
            <div><strong>{teacher.fullName}</strong><span>{teacher.phone || 'لا يوجد هاتف'}</span><ChipList items={teacher.subjectIds.map(id => store.subjects.find(s => s.id === id)?.name).filter(Boolean)} empty="لا توجد مواد" /></div>
            <div className="creditActions"><button onClick={() => showProgram(teacher.id)}>عرض البرنامج</button><button onClick={() => edit(teacher)}>تعديل</button><button onClick={() => remove(teacher)}>حذف</button></div>
          </article>)}
        </div>
      </div>
    </section>
  );
}

function TeacherProgramsPage({ store, updateStore, selectedTeacherId, setSelectedTeacherId }) {
  const teacher = store.teachers.find(t => t.id === selectedTeacherId) || store.teachers[0];
  const [form, setForm] = useState({ day: '', startTime: '', endTime: '', subjectId: '', level: '', group: '', room: '', notes: '' });
  const [editId, setEditId] = useState('');
  const schedules = teacher ? store.teacherSchedules.filter(s => s.teacherId === teacher.id) : [];
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const save = (e) => {
    e.preventDefault();
    if (!teacher || !form.day || !form.subjectId) return;
    const schedule = { id: editId || uid('sch'), teacherId: teacher.id, ...form };
    updateStore(s => {
      if (editId) s.teacherSchedules = s.teacherSchedules.map(x => x.id === editId ? schedule : x);
      else s.teacherSchedules.push(schedule);
    });
    setForm({ day: '', startTime: '', endTime: '', subjectId: '', level: '', group: '', room: '', notes: '' });
    setEditId('');
  };
  const edit = (schedule) => { setEditId(schedule.id); setForm({ day: schedule.day, startTime: schedule.startTime, endTime: schedule.endTime, subjectId: schedule.subjectId, level: schedule.level, group: schedule.group, room: schedule.room, notes: schedule.notes }); };
  const remove = (schedule) => {
    updateStore(s => {
      s.teacherSchedules = s.teacherSchedules.filter(x => x.id !== schedule.id);
      s.studentSubjects = s.studentSubjects.map(link => link.scheduleId === schedule.id ? { ...link, scheduleId: '' } : link);
    });
  };
  return (
    <section className="pageGrid">
      <div className="panel">
        <div className="toolbar">
          <label>الأستاذ<select value={teacher?.id || ''} onChange={e => setSelectedTeacherId(e.target.value)}><option value="">اختر الأستاذ</option>{store.teachers.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}</select></label>
        </div>
      </div>
      <section className="twoCols">
        <form className="panel" onSubmit={save}>
          <h3>{editId ? 'تعديل حصة' : 'إضافة حصة إلى البرنامج'}</h3>
          <label>اليوم<select value={form.day} required onChange={e => set('day', e.target.value)}><option value="">اختر اليوم</option>{WEEK_DAYS.map(day => <option key={day}>{day}</option>)}</select></label>
          <Input type="time" label="وقت بداية الحصة" value={form.startTime} onChange={v => set('startTime', v)} />
          <Input type="time" label="وقت نهاية الحصة" value={form.endTime} onChange={v => set('endTime', v)} />
          <label>المادة<select value={form.subjectId} required onChange={e => set('subjectId', e.target.value)}><option value="">اختر المادة</option>{store.subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
          <label>السنة الدراسية<select value={form.level} onChange={e => set('level', e.target.value)}><option value="">اختر السنة</option>{SCHOOL_YEARS.map(year => <option key={year}>{year}</option>)}</select></label>
          <Input label="الفوج" value={form.group} onChange={v => set('group', v)} />
          <Input label="القاعة" value={form.room} onChange={v => set('room', v)} />
          <label>ملاحظات<textarea value={form.notes} onChange={e => set('notes', e.target.value)} /></label>
          <button className="primaryBtn">{editId ? 'حفظ الحصة' : 'إضافة الحصة'}</button>
        </form>
        <div className="panel">
          <h3>البرنامج الأسبوعي {teacher ? `- ${teacher.fullName}` : ''}</h3>
          <WeeklySchedule schedules={schedules} store={store} onEdit={edit} onRemove={remove} />
        </div>
      </section>
    </section>
  );
}

function PaymentsPage({ store, updateStore, selectedStudentId, setSelectedStudentId }) {
  const initialStudentId = selectedStudentId && selectedStudentId !== 'new' ? selectedStudentId : store.students[0]?.id || '';
  const [studentId, setStudentId] = useState(initialStudentId);
  const selected = store.students.find(s => s.id === initialStudentId);
  const [amount, setAmount] = useState(selected?.creditAmount ? Number(selected.creditAmount) : '');
  const [duration, setDuration] = useState(store.settings.defaultDurationMonths ? String(store.settings.defaultDurationMonths) : '');
  const [customDays, setCustomDays] = useState('');
  const student = store.students.find(s => s.id === studentId);
  const history = store.payments.filter(p => p.studentId === studentId).sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));

  useEffect(() => {
    const nextStudent = store.students.find(s => s.id === studentId);
    setAmount(nextStudent?.creditAmount ? Number(nextStudent.creditAmount) : '');
  }, [studentId, store.students]);

  const submit = (e) => {
    e.preventDefault();
    if (!studentId || !amount || !duration) return;
    const paidAt = todayISO();
    const expiryDate = duration === 'custom' ? addDays(paidAt, customDays) : addMonths(paidAt, Number(duration));
    updateStore(s => {
      s.payments.unshift({ id: uid('pay'), studentId, amount, paidAt, durationLabel: duration === 'custom' ? `${customDays} يوم` : `${duration} شهر`, expiryDate, note: '' });
      s.students = s.students.map(x => x.id === studentId ? {
        ...x,
        lastPaymentDate: paidAt,
        expiryDate,
        creditAmount: 0,
        debtStartDate: '',
        lastReminderDate: '',
        creditNotes: x.creditNotes ? `${x.creditNotes}\nتمت تسوية الكريدي في ${paidAt}.` : ''
      } : x);
    });
    setSelectedStudentId(studentId);
  };
  return (
    <section className="twoCols">
      <form className="panel" onSubmit={submit}>
        <h3>تسجيل دفع جديد</h3>
        <label>التلميذ<select value={studentId} onChange={e => setStudentId(e.target.value)}><option value="">اختر التلميذ</option>{store.students.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}</select></label>
        <Input type="number" label="مبلغ الدفع" value={amount} onChange={setAmount} required />
        <label>مدة الاشتراك<select value={duration} required onChange={e => setDuration(e.target.value)}><option value="">اختر مدة الاشتراك</option><option value="1">شهر</option><option value="2">شهران</option><option value="3">ثلاثة أشهر</option><option value="custom">مدة مخصصة</option></select></label>
        {duration === 'custom' && <Input type="number" label="عدد الأيام" value={customDays} onChange={setCustomDays} required />}
        {student && isCreditStudent(student) && <div className="creditHint">هذا التلميذ موجود في الكريديات. تسجيل الدفع سيحذف المستحقات تلقائياً.</div>}
        <button className="primaryBtn"><CreditCard size={18} /> تسجيل الدفع وتحديث الاشتراك</button>
      </form>
      <div className="panel">
        <h3>سجل الدفعات</h3>
        {student && <StudentMini student={student} />}
        <div className="paymentList">{history.map(p => <div key={p.id}><strong>{money(p.amount)}</strong><span>{p.durationLabel}</span><small>{dateText(p.paidAt)} إلى {dateText(p.expiryDate)}</small></div>)}</div>
      </div>
    </section>
  );
}

function CreditsPage({ store, updateStore, setPage, setSelectedStudentId }) {
  const creditStudents = store.students.filter(isCreditStudent);
  const [q, setQ] = useState('');
  const [year, setYear] = useState(ALL);
  const [group, setGroup] = useState(ALL);
  const groups = [ALL, ...new Set(creditStudents.map(s => s.group).filter(Boolean))];
  const filtered = creditStudents.filter(s => {
    const hit = [s.fullName, s.phone, s.guardianName, s.guardianPhone].join(' ').toLowerCase().includes(q.toLowerCase());
    return hit && (year === ALL || s.level === year) && (group === ALL || s.group === group);
  });
  const total = creditStudents.reduce((sum, s) => sum + Number(s.creditAmount || 0), 0);
  const goPayment = (studentId) => { setSelectedStudentId(studentId); setPage('payments'); };
  const goProfile = (studentId) => { setSelectedStudentId(studentId); setPage('student-profile'); };
  const addNote = (student) => {
    const note = prompt('أدخل ملاحظة الكريدي', student.creditNotes || '');
    if (note === null) return;
    updateStore(s => {
      s.students = s.students.map(x => x.id === student.id ? { ...x, creditNotes: note, lastReminderDate: todayISO() } : x);
    });
  };
  return (
    <section className="pageGrid">
      <div className="creditSummary">
        <article><span>عدد التلاميذ في الكريديات</span><strong>{creditStudents.length}</strong></article>
        <article><span>إجمالي المبالغ غير المدفوعة</span><strong>{money(total)}</strong></article>
      </div>
      <section className="panel">
        <div className="toolbar">
          <div className="searchBox"><Search size={18} /><input placeholder="بحث في الكريديات بالاسم أو الهاتف أو الولي" value={q} onChange={e => setQ(e.target.value)} /></div>
          <select value={year} onChange={e => setYear(e.target.value)}><option>{ALL}</option>{SCHOOL_YEARS.map(item => <option key={item}>{item}</option>)}</select>
          <select value={group} onChange={e => setGroup(e.target.value)}>{groups.map(item => <option key={item}>{item}</option>)}</select>
        </div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>التلميذ</th><th>السنة</th><th>الفوج</th><th>الهاتف</th><th>الولي</th><th>المبلغ</th><th>بداية الدين</th><th>آخر تذكير</th><th>ملاحظات</th><th></th></tr></thead>
            <tbody>
              {filtered.map(s => <tr key={s.id}><td><StudentMini student={s} /></td><td>{s.level}</td><td>{s.group}</td><td>{s.phone}</td><td>{s.guardianName}<small className="blockMuted">{s.guardianPhone}</small></td><td><strong>{money(s.creditAmount)}</strong></td><td>{dateText(s.debtStartDate || s.registrationDate)}</td><td>{dateText(s.lastReminderDate)}</td><td className="noteCell">{s.creditNotes || 'لا توجد ملاحظة'}</td><td className="creditActions"><button onClick={() => goPayment(s.id)}>تسجيل الدفع</button><button onClick={() => goProfile(s.id)}>عرض الملف</button><button onClick={() => addNote(s)}>إضافة ملاحظة</button></td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function QrCardPage({ student, store }) {
  const [qr, setQr] = useState('');
  const rows = student?.id ? getStudentAcademicRows(student.id, store) : [];
  useEffect(() => {
    if (student?.secureId) QRCode.toDataURL(student.secureId, { width: 220, margin: 2, color: { dark: '#0f376d', light: '#ffffff' } }).then(setQr);
  }, [student?.secureId]);
  if (!student || student.id === 'new') return <section className="panel">لا يوجد تلميذ محدد</section>;
  const download = () => {
    const a = document.createElement('a');
    a.href = qr;
    a.download = `${student.registrationNumber}-qr.png`;
    a.click();
  };
  return (
    <section className="qrPage">
      <div className="idCard" id="student-card">
        <div className="cardTop">{store.settings.logo ? <img src={store.settings.logo} alt="" /> : <GraduationCap />}<strong>{store.settings.associationName}</strong></div>
        <h3>{student.fullName}</h3>
        <p>{student.level}</p>
        <div className="qrBox">{qr && <img src={qr} alt="QR" />}</div>
        <div className="regNo">{student.registrationNumber}</div>
      </div>
      <div className="panel cardTools">
        <h3>بطاقة التلميذ</h3>
        <StudentMini student={student} />
        <p className="mutedLine">السنة الدراسية: {student.level}</p>
        <ChipList items={rows.map(row => row.subject?.name).filter(Boolean)} empty="لا توجد مواد مسجلة" />
        <button className="primaryBtn" onClick={download}><Download size={18} /> تحميل رمز QR</button>
        <button onClick={() => print()}><Printer size={18} /> طباعة البطاقة</button>
      </div>
    </section>
  );
}

function ScannerPage({ store, updateStore }) {
  const scannerRef = useRef(null);
  const lastScanRef = useRef({ text: '', at: 0 });
  const [result, setResult] = useState(null);
  const [manual, setManual] = useState('');
  const [active, setActive] = useState(false);

  const handleScan = (text) => {
    const clean = text.trim();
    const now = Date.now();
    if (lastScanRef.current.text === clean && now - lastScanRef.current.at < 2200) return;
    lastScanRef.current = { text: clean, at: now };
    const student = store.students.find(s => s.secureId === clean);
    if (!student) {
      setResult({ type: 'invalid', message: 'بطاقة غير معروفة' });
      playTone('invalid', store.settings.sounds);
      return;
    }
    const rows = getStudentAcademicRows(student.id, store);
    const inCredit = isCreditStudent(student);
    const allowed = !inCredit && [PAID, SOON].includes(student.paymentStatus);
    const message = inCredit
      ? 'تنبيه: هذا التلميذ لديه مستحقات غير مدفوعة.'
      : allowed
        ? 'تم تسجيل الدخول بنجاح'
        : 'تنبيه: اشتراك هذا التلميذ غير مدفوع أو منتهي';
    updateStore(s => s.attendanceLogs.unshift({
      id: uid('att'),
      studentId: student.id,
      studentName: student.fullName,
      scannedAt: nowISO(),
      paymentStatus: inCredit ? CREDIT : student.paymentStatus,
      allowed,
      deviceName: 'جهاز الاستقبال',
      message
    }));
    setResult({ type: allowed ? 'success' : 'danger', message, student, rows, inCredit });
    playTone(allowed ? 'success' : 'alert', store.settings.sounds);
  };

  const start = async () => {
    if (active) return;
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;
    setActive(true);
    try {
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } }, handleScan);
    } catch {
      setActive(false);
      setResult({ type: 'invalid', message: 'تعذر تشغيل الكاميرا. يمكن استعمال الإدخال اليدوي للتجربة.' });
    }
  };
  const stop = async () => {
    if (scannerRef.current?.isScanning) await scannerRef.current.stop();
    setActive(false);
  };
  useEffect(() => () => { if (scannerRef.current?.isScanning) scannerRef.current.stop(); }, []);

  return (
    <section className="scannerGrid">
      <div className="panel scannerPanel">
        <div id="qr-reader"></div>
        <div className="scannerActions">
          <button className="primaryBtn" onClick={start}><Camera size={18} /> تشغيل الكاميرا</button>
          <button onClick={stop}>إيقاف</button>
        </div>
        <div className="manualScan">
          <input placeholder="اختبار بمعرف QR آمن" value={manual} onChange={e => setManual(e.target.value)} />
          <button onClick={() => handleScan(manual)}>فحص</button>
        </div>
      </div>
      <div className={`scanResult ${result?.type || ''}`}>
        {result ? <>
          <h3>{result.message}</h3>
          {result.student && <>
            <StudentMini student={result.student} />
            <p>السنة الدراسية: {result.student.level}</p>
            {result.inCredit ? <p>المبلغ غير المدفوع: <strong>{money(result.student.creditAmount)}</strong></p> : <p>انتهاء الاشتراك: {dateText(result.student.expiryDate)}</p>}
            <p>حالة الدفع: <Status status={result.inCredit ? CREDIT : result.student.paymentStatus} /></p>
            <AcademicTable rows={result.rows} compact />
          </>}
        </> : <h3>وجه الكاميرا إلى بطاقة QR</h3>}
      </div>
    </section>
  );
}

function LogsPage({ store }) {
  const [range, setRange] = useState('today');
  const [q, setQ] = useState('');
  const from = new Date();
  if (range === 'week') from.setDate(from.getDate() - 7);
  if (range === 'month') from.setMonth(from.getMonth() - 1);
  const filtered = store.attendanceLogs.filter(l => (range === 'all' || new Date(l.scannedAt) >= from) && l.studentName.toLowerCase().includes(q.toLowerCase()));
  const counts = store.students.map(s => ({ name: s.fullName, count: store.attendanceLogs.filter(l => l.studentId === s.id).length })).sort((a, b) => b.count - a.count).slice(0, 6);
  return (
    <section className="twoCols logsLayout">
      <div className="panel">
        <div className="toolbar compact"><div className="searchBox"><Search size={18} /><input placeholder="بحث باسم التلميذ" value={q} onChange={e => setQ(e.target.value)} /></div><select value={range} onChange={e => setRange(e.target.value)}><option value="today">اليوم</option><option value="week">الأسبوع</option><option value="month">الشهر</option><option value="all">الكل</option></select></div>
        <div className="tableWrap">
          <table><thead><tr><th>التلميذ</th><th>الوقت</th><th>الحالة</th><th>الدخول</th><th>الجهاز</th></tr></thead><tbody>{filtered.map(l => <tr key={l.id}><td>{l.studentName}</td><td>{dateTimeText(l.scannedAt)}</td><td><Status status={l.paymentStatus} /></td><td>{l.allowed ? 'مسموح' : 'تنبيه'}</td><td>{l.deviceName}</td></tr>)}</tbody></table>
        </div>
      </div>
      <div className="panel"><h3>عدد مرات الحضور</h3><div className="attendanceCounts">{counts.map(c => <div key={c.name}><span>{c.name}</span><b>{c.count}</b></div>)}</div></div>
    </section>
  );
}

function ReportsPage({ store }) {
  const [range, setRange] = useState('month');
  const totalIncome = store.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const totalCredit = store.students.filter(isCreditStudent).reduce((sum, student) => sum + Number(student.creditAmount || 0), 0);
  const yearStats = SCHOOL_YEARS.map(year => ({ year, count: store.students.filter(student => student.level === year).length }));
  const maxCount = Math.max(...yearStats.map(item => item.count), 1);
  const cards = [
    ['إجمالي التلاميذ', store.students.length, Users],
    ['إجمالي المداخيل', money(totalIncome), CreditCard],
    ['إجمالي الكريديات', money(totalCredit), Bell],
    ['عمليات الدخول', store.attendanceLogs.length, Camera]
  ];
  return (
    <section className="pageGrid reportsPage">
      <div className="reportToolbar panel">
        <h3>التقارير</h3>
        <select value={range} onChange={e => setRange(e.target.value)}><option value="month">هذا الشهر</option><option value="quarter">آخر 3 أشهر</option><option value="year">هذا العام</option></select>
      </div>
      <div className="dashboardStats">
        {cards.map(([label, value, Icon]) => <article className="statCard" key={label}><div className="statIcon"><Icon size={23} /></div><span>{label}</span><strong>{value}</strong><small>{range === 'month' ? 'الفترة الحالية' : 'حسب الفلتر'}</small></article>)}
      </div>
      <div className="widePanel">
        <div className="panelHeader"><h3>إحصائيات التلاميذ حسب السنوات</h3><span className="mutedLine">مخطط أعمدة</span></div>
        <div className="barChart">
          {yearStats.map(item => <div className="barItem" key={item.year}><div><span style={{ height: `${8 + (item.count / maxCount) * 92}%` }} /></div><b>{item.count}</b><small>{item.year.replace('السنة ', '')}</small></div>)}
        </div>
      </div>
    </section>
  );
}

function SmartAssistantPage({ store }) {
  const [messages, setMessages] = useState([{ role: 'assistant', text: AI_WELCOME_MESSAGE }]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const chatEndRef = useRef(null);
  const quickQuestions = [
    'كم عدد التلاميذ المسجلين؟',
    'من هم التلاميذ الذين لم يدفعوا؟',
    'كم مجموع مبالغ الكريديات؟',
    'من تنتهي اشتراكاتهم قريباً؟',
    'من دخل اليوم عبر بطاقة QR؟',
    'أعطني ملخصاً ذكياً عن الجمعية.'
  ];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, thinking]);

  const ask = (text) => {
    const question = text.trim();
    if (!question || thinking) return;
    setMessages(prev => [...prev, { role: 'user', text: question }]);
    setInput('');
    setThinking(true);
    window.setTimeout(() => {
      const answer = answerAssistantQuestion(question, store);
      setMessages(prev => [...prev, { role: 'assistant', text: answer }]);
      setThinking(false);
    }, 450);
  };

  const submit = (e) => {
    e.preventDefault();
    ask(input);
  };

  return (
    <section className="assistantPage">
      <div className="assistantHeader panel">
        <div>
          <Bot size={30} />
          <div>
            <h3>المساعد الذكي</h3>
            <p>{AI_ASSISTANT_NAME}</p>
          </div>
        </div>
        <button onClick={() => setMessages([{ role: 'assistant', text: AI_WELCOME_MESSAGE }])}><Trash2 size={17} /> مسح المحادثة</button>
      </div>
      <div className="assistantGrid">
        <div className="panel assistantSidebar">
          <h3>اقتراحات سريعة</h3>
          {quickQuestions.map(question => <button key={question} onClick={() => ask(question)}>{question}</button>)}
          <div className="assistantNote">
            <ShieldCheck size={18} />
            <span>المساعد يقرأ البيانات فقط ولا يملك صلاحية تعديلها أو حذفها.</span>
          </div>
        </div>
        <div className="panel chatPanel">
          <div className="chatMessages">
            {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`chatBubble ${message.role}`}>
              <span>{message.role === 'assistant' ? AI_ASSISTANT_NAME : 'الإدارة'}</span>
              <p>{message.text}</p>
            </div>)}
            {thinking && <div className="chatBubble assistant thinking"><span>{AI_ASSISTANT_NAME}</span><p>يفكر...</p></div>}
            <div ref={chatEndRef} />
          </div>
          <form className="chatComposer" onSubmit={submit}>
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="اكتب سؤالك عن بيانات الجمعية..." />
            <button className="primaryBtn" disabled={thinking}><Send size={18} /> إرسال</button>
          </form>
        </div>
      </div>
    </section>
  );
}

function SettingsPage({ settings, updateStore }) {
  const [form, setForm] = useState(settings);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  useEffect(() => setForm(settings), [settings]);
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const handleLogoUpload = async (file) => {
    if (!file) return;
    setUploadingLogo(true);
    try {
      const url = await uploadFileToStorage('settings/logo', file);
      set('logo', url);
    } catch (error) {
      alert(`تعذر رفع شعار الجمعية: ${error.message}`);
    } finally {
      setUploadingLogo(false);
    }
  };
  const save = (e) => {
    e.preventDefault();
    updateStore(s => { s.settings = form; });
  };
  return (
    <form className="panel formPanel" onSubmit={save}>
      <h3>الإعدادات العامة</h3>
      <div className="settingsLayout">
        <aside className="settingsMenu"><button className="active" type="button">عام</button><button type="button">الإشعارات</button><button type="button">الدفع</button><button type="button">التنبيهات</button></aside>
        <div className="formGrid">
          <Input label="اسم الجمعية" value={form.associationName} onChange={v => set('associationName', v)} />
          <label className="fileInput"><Upload size={18} /> {uploadingLogo ? 'جار رفع الشعار...' : 'رفع شعار الجمعية'}<input type="file" accept="image/*" onChange={e => handleLogoUpload(e.target.files?.[0])} /></label>
          <Input type="number" label="مدة الاشتراك الافتراضية بالأشهر" value={form.defaultDurationMonths} onChange={v => set('defaultDurationMonths', v)} />
          <Input type="number" label="أيام التنبيه قبل الانتهاء" value={form.soonDays} onChange={v => set('soonDays', v)} />
          <label className="toggle"><input type="checkbox" checked={form.sounds} onChange={e => set('sounds', e.target.checked)} /> تشغيل أصوات التنبيه</label>
          <label>نغمة النجاح<select value={form.successTone} onChange={e => set('successTone', e.target.value)}><option value="">اختر نغمة النجاح</option><option value="success">قصيرة</option><option value="soft">هادئة</option></select></label>
          <label>نغمة الإنذار<select value={form.alertTone} onChange={e => set('alertTone', e.target.value)}><option value="">اختر نغمة الإنذار</option><option value="alert">واضحة</option><option value="sharp">قوية</option></select></label>
        </div>
      </div>
      <button className="primaryBtn saveBtn">حفظ الإعدادات</button>
    </form>
  );
}

function AcademicTable({ rows, compact }) {
  if (!rows?.length) return <p className="mutedLine">لا توجد مواد مسجلة لهذا التلميذ.</p>;
  return (
    <div className="tableWrap">
      <table className={compact ? 'compactTable' : ''}>
        <thead><tr><th>المادة</th><th>الأستاذ</th><th>الحصة</th><th>السنة</th><th>الفوج</th><th>القاعة</th><th>ملاحظة</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}><td>{row.subject?.name || 'غير محدد'}</td><td>{row.teacher?.fullName || 'غير محدد'}</td><td>{timeRange(row.schedule)}</td><td>{row.schedule?.level || 'غير محدد'}</td><td>{row.schedule?.group || 'غير محدد'}</td><td>{row.schedule?.room || 'غير محدد'}</td><td>{row.note || 'لا توجد'}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function WeeklySchedule({ schedules, store, onEdit, onRemove }) {
  return (
    <div className="weekGrid">
      {WEEK_DAYS.map(day => {
        const daySchedules = schedules.filter(schedule => schedule.day === day).sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
        return <section key={day} className="dayColumn"><h4>{day}</h4>{daySchedules.length ? daySchedules.map(schedule => {
          const subject = store.subjects.find(s => s.id === schedule.subjectId);
          return <article key={schedule.id} className="lessonCard"><strong>{subject?.name || 'مادة غير محددة'}</strong><span>{schedule.startTime || '--:--'} - {schedule.endTime || '--:--'}</span><small>{schedule.level || 'سنة غير محددة'} | {schedule.group || 'فوج غير محدد'} | {schedule.room || 'بدون قاعة'}</small><div className="rowActions"><button onClick={() => onEdit(schedule)}><Edit3 size={15} /></button><button onClick={() => onRemove(schedule)}><Trash2 size={15} /></button></div></article>;
        }) : <p className="mutedLine">لا توجد حصص</p>}</section>;
      })}
    </div>
  );
}

function Picker({ title, items, selected, onToggle, empty }) {
  return (
    <div className="pickerBox">
      <span>{title}</span>
      <div className="pickerItems">
        {items.length ? items.map(item => <button type="button" key={item.id} className={selected.includes(item.id) ? 'selected' : ''} onClick={() => onToggle(item.id)}>{item.label}</button>) : <small>{empty || 'لا توجد اختيارات'}</small>}
      </div>
    </div>
  );
}

function ChipList({ items, empty }) {
  const clean = [...new Set(items.filter(Boolean))];
  if (!clean.length) return <span className="mutedLine">{empty}</span>;
  return <div className="chips">{clean.map(item => <span key={item}>{item}</span>)}</div>;
}

function Input({ label, value, onChange, type = 'text', required }) {
  return <label>{label}<input type={type} value={value || ''} required={required} onChange={e => onChange(e.target.value)} /></label>;
}

function Status({ status }) {
  const cls = status === PAID ? 'paid' : status === SOON ? 'soon' : status === CREDIT ? 'credit' : status === EXPIRED ? 'expired' : 'unpaid';
  return <span className={`status ${cls}`}>{status}</span>;
}

function StudentMini({ student }) {
  return <div className="studentMini">{student.photo ? <img src={student.photo} alt="" /> : <div className="avatar">{student.fullName?.slice(0, 1) || '؟'}</div>}<div><strong>{student.fullName || 'بدون اسم'}</strong><small>{student.registrationNumber || 'بدون رقم تسجيل'}</small></div></div>;
}

createRoot(document.getElementById('root')).render(<App />);
