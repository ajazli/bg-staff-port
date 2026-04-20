export const LEAVE_COLS = ['Annual leave', 'Medical leave', 'PH off in lieu', 'Emergency leave']
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
  '2026-01-01': { name: "New Year's Day" },
  '2026-02-17': { name: 'Chinese New Year' },
  '2026-02-18': { name: 'Chinese New Year' },
  '2026-03-21': { name: 'Hari Raya Puasa' },
  '2026-04-03': { name: 'Good Friday' },
  '2026-05-01': { name: 'Labour Day' },
  '2026-05-27': { name: 'Hari Raya Haji' },
  '2026-05-31': { name: 'Vesak Day' },
  '2026-06-01': { name: 'Vesak Day (day in lieu)' },
  '2026-08-09': { name: 'National Day' },
  '2026-08-10': { name: 'National Day (day in lieu)' },
  '2026-11-08': { name: 'Deepavali' },
  '2026-11-09': { name: 'Deepavali (day in lieu)' },
  '2026-12-25': { name: 'Christmas Day' },
}

export const initialData = {
  branches: [
    { id: 'b1', name: 'East Coast', lat: null, lng: null, radius: 150 },
    { id: 'b2', name: 'Lor Kilat', lat: null, lng: null, radius: 150 },
    { id: 'b3', name: 'New Branch', lat: null, lng: null, radius: 150 },
  ],
  users: {
    alice: {
      name: 'Alice Tan', initials: 'AT', role: 'staff', password: 'pass123', mustSetPw: false,
      branchIds: ['b1', 'b2'], expectedStart: '09:00', expectedEnd: '18:00', workDays: [1,2,3,4,5], memo: ''
    },
    bob: {
      name: 'Bob Lim', initials: 'BL', role: 'staff', password: null, mustSetPw: true,
      branchIds: ['b2'], expectedStart: '09:00', expectedEnd: '18:00', workDays: [1,2,3,4,5], memo: ''
    },
    admin: {
      name: 'Admin', initials: 'AD', role: 'admin', password: 'admin123', mustSetPw: false,
      branchIds: [], expectedStart: '', expectedEnd: '', workDays: [1,2,3,4,5], memo: ''
    },
  },
  attendance: {
    alice: [
      { date: '2026-04-18', in: '09:02', out: '18:05', hours: '9h 3m', status: 'complete', branchId: 'b1', branchName: 'East Coast', locOk: true },
      { date: '2026-04-17', in: '08:55', out: '18:00', hours: '9h 5m', status: 'complete', branchId: 'b2', branchName: 'Lor Kilat', locOk: true },
    ],
    bob: [],
    admin: [],
  },
  leaves: {
    alice: [{ type: 'Annual leave', start: '2026-05-01', end: '2026-05-03', days: 3, reason: 'Family trip', status: 'approved' }],
    bob: [],
    admin: [],
  },
  balances: {
    alice: { 'Annual leave': { total: 14, used: 3 }, 'Medical leave': { total: 14, used: 0 }, 'PH off in lieu': { total: 0, used: 0 }, 'Emergency leave': { total: 3, used: 0 } },
    bob: { 'Annual leave': { total: 14, used: 0 }, 'Medical leave': { total: 14, used: 0 }, 'PH off in lieu': { total: 0, used: 0 }, 'Emergency leave': { total: 3, used: 0 } },
    admin: { 'Annual leave': { total: 14, used: 0 }, 'Medical leave': { total: 14, used: 0 }, 'PH off in lieu': { total: 0, used: 0 }, 'Emergency leave': { total: 3, used: 0 } },
  },
}
