export const LEAVE_TYPES = [
  { id: 'Annual Leave',          label: 'Annual Leave',          requiresFile: false, color: '#43a047', defaultDays: 14 },
  { id: 'Sick Leave',            label: 'Sick Leave (MC)',        requiresFile: true,  color: '#e53935', defaultDays: 14 },
  { id: 'Hospitalisation Leave', label: 'Hospitalisation Leave', requiresFile: true,  color: '#d81b60', defaultDays: 60 },
  { id: 'Childcare Leave',       label: 'Childcare Leave',       requiresFile: false, color: '#8e24aa', defaultDays: 6  },
  { id: 'Maternity Leave',       label: 'Maternity Leave',       requiresFile: false, color: '#fb8c00', defaultDays: 112 },
  { id: 'Paternity Leave',       label: 'Paternity Leave',       requiresFile: false, color: '#f4511e', defaultDays: 14 },
  { id: 'NS Leave',              label: 'NS Leave',              requiresFile: true,  color: '#6d4c41', defaultDays: 0  },
  { id: 'Compassionate Leave',   label: 'Compassionate Leave',   requiresFile: true,  color: '#546e7a', defaultDays: 3  },
  { id: 'Unpaid Leave',          label: 'Unpaid Leave',          requiresFile: false, color: '#757575', defaultDays: 0  },
  { id: 'PH Off-in-Lieu',        label: 'PH Off-in-Lieu',        requiresFile: false, color: '#00acc1', defaultDays: 0  },
]

export const WORKDAY_OPTIONS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

export const SG_PUBLIC_HOLIDAYS = {
  // 2025
  '2025-01-01': { name: "New Year's Day" },
  '2025-01-29': { name: 'Chinese New Year' },
  '2025-01-30': { name: 'Chinese New Year' },
  '2025-03-31': { name: 'Hari Raya Puasa' },
  '2025-04-18': { name: 'Good Friday' },
  '2025-05-01': { name: 'Labour Day' },
  '2025-05-12': { name: 'Vesak Day' },
  '2025-06-06': { name: 'Hari Raya Haji' },
  '2025-08-09': { name: 'National Day' },
  '2025-08-11': { name: 'National Day (in lieu)' },
  '2025-10-20': { name: 'Deepavali' },
  '2025-12-25': { name: 'Christmas Day' },
  // 2026
  '2026-01-01': { name: "New Year's Day" },
  '2026-02-17': { name: 'Chinese New Year' },
  '2026-02-18': { name: 'Chinese New Year' },
  '2026-03-21': { name: 'Hari Raya Puasa' },
  '2026-04-03': { name: 'Good Friday' },
  '2026-05-01': { name: 'Labour Day' },
  '2026-05-27': { name: 'Hari Raya Haji' },
  '2026-05-31': { name: 'Vesak Day' },
  '2026-06-01': { name: 'Vesak Day (in lieu)' },
  '2026-08-09': { name: 'National Day' },
  '2026-08-10': { name: 'National Day (in lieu)' },
  '2026-11-08': { name: 'Deepavali' },
  '2026-11-09': { name: 'Deepavali (in lieu)' },
  '2026-12-25': { name: 'Christmas Day' },
  // 2027
  '2027-01-01': { name: "New Year's Day" },
  '2027-01-26': { name: 'Chinese New Year' },
  '2027-01-27': { name: 'Chinese New Year' },
  '2027-03-10': { name: 'Hari Raya Puasa' },
  '2027-03-26': { name: 'Good Friday' },
  '2027-05-01': { name: 'Labour Day' },
  '2027-05-03': { name: 'Labour Day (in lieu)' },
  '2027-05-17': { name: 'Hari Raya Haji' },
  '2027-05-20': { name: 'Vesak Day' },
  '2027-08-09': { name: 'National Day' },
  '2027-10-27': { name: 'Deepavali' },
  '2027-12-25': { name: 'Christmas Day' },
  '2027-12-27': { name: 'Christmas Day (in lieu)' },
}

function defaultBalances() {
  return Object.fromEntries(LEAVE_TYPES.map((t) => [t.id, { total: t.defaultDays, used: 0 }]))
}

export const initialData = {
  branches: [
    { id: 'b1', name: 'East Coast', lat: 1.30215, lng: 103.90879, radius: 100, address: '380 E Coast Rd, Singapore 428986', color: '#5b7fb8' },
    { id: 'b2', name: 'Kilat',      lat: 1.33968, lng: 103.77606, radius: 100, address: '19 Lor Kilat, #01-02, Singapore 598120', color: '#43a047' },
  ],
  users: {
    alice: {
      name: 'Alice Tan', initials: 'AT', role: 'team_lead',
      password: 'pass123', mustSetPw: false,
      branchIds: ['b1', 'b2'], reportsTo: 'admin',
      expectedStart: '09:00', expectedEnd: '18:00',
      workDays: [1, 2, 3, 4, 5], memo: '',
    },
    bob: {
      name: 'Bob Lim', initials: 'BL', role: 'staff',
      password: null, mustSetPw: true,
      branchIds: ['b2'], reportsTo: 'alice',
      expectedStart: '09:00', expectedEnd: '18:00',
      workDays: [1, 2, 3, 4, 5], memo: '',
    },
    carol: {
      name: 'Carol Ng', initials: 'CN', role: 'staff',
      password: 'carol123', mustSetPw: false,
      branchIds: ['b1'], reportsTo: 'alice',
      expectedStart: '09:00', expectedEnd: '18:00',
      workDays: [1, 2, 3, 4, 5], memo: '',
    },
    admin: {
      name: 'Admin', initials: 'AD', role: 'admin',
      password: 'admin123', mustSetPw: false,
      branchIds: [], reportsTo: null,
      expectedStart: '', expectedEnd: '',
      workDays: [1, 2, 3, 4, 5], memo: '',
    },
  },
  attendance: {
    alice: [
      { date: '2026-04-18', in: '09:02', out: '18:05', hours: '9h 3m', status: 'complete', branchId: 'b1', branchName: 'East Coast', locOk: true },
      { date: '2026-04-17', in: '08:55', out: '18:00', hours: '9h 5m', status: 'complete', branchId: 'b2', branchName: 'Kilat',      locOk: true },
    ],
    bob:   [],
    carol: [],
    admin: [],
  },
  leaves: {
    alice: [{ type: 'Annual Leave', start: '2026-05-01', end: '2026-05-03', days: 3, reason: 'Family trip', status: 'approved', attachmentName: '', attachmentUrl: '' }],
    bob:   [],
    carol: [],
    admin: [],
  },
  balances: {
    alice: { ...defaultBalances(), 'Annual Leave': { total: 14, used: 3 } },
    bob:   defaultBalances(),
    carol: defaultBalances(),
    admin: defaultBalances(),
  },
  shiftTemplates: [
    { id: 'st1', name: 'Morning',   startTime: '07:00', endTime: '15:00', color: '#FFB74D' },
    { id: 'st2', name: 'Afternoon', startTime: '12:00', endTime: '20:00', color: '#4DB6AC' },
    { id: 'st3', name: 'Full Day',  startTime: '09:00', endTime: '18:00', color: '#7986CB' },
  ],
  schedules: {
    alice: [
      { id: 'sch1', date: '2026-04-21', branchId: 'b1', templateId: 'st3', startTime: '09:00', endTime: '18:00', note: '' },
      { id: 'sch2', date: '2026-04-22', branchId: 'b2', templateId: 'st1', startTime: '07:00', endTime: '15:00', note: '' },
    ],
    bob:   [],
    carol: [],
    admin: [],
  },
  calendarEvents: [
    { id: 'evt1', title: 'Team Meeting', date: '2026-04-22', color: '#AB47BC', createdBy: 'admin' },
  ],
  activeSessions: {},
}
