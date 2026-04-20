const TOKEN_KEY = 'bg-jwt'

export const getToken   = ()  => localStorage.getItem(TOKEN_KEY)
export const setToken   = (t) => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = ()  => localStorage.removeItem(TOKEN_KEY)

async function req(method, path, body) {
  const token = getToken()
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    clearToken()
    window.location.reload()
    return
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export const api = {
  // Auth
  login:         (username, password) => req('POST', '/auth/login',          { username, password }),
  setupPassword: (userId, password)   => req('POST', '/auth/setup-password', { userId, password }),
  me:            ()                   => req('GET',  '/auth/me'),

  // App data (single call returns everything)
  getAppData: () => req('GET', '/app-data'),

  // Users
  createUser:  (data)              => req('POST',   '/users',              data),
  updateUser:  (id, data)          => req('PUT',    `/users/${id}`,        data),
  deleteUser:  (id)                => req('DELETE', `/users/${id}`),
  setBalance:  (uid, leaveType, field, value) => req('PUT', `/users/${uid}/balance`, { leaveType, field, value }),

  // Branches
  createBranch: (data) => req('POST',   '/branches',       data),
  updateBranch: (id, data) => req('PUT',    `/branches/${id}`, data),
  deleteBranch: (id)  => req('DELETE', `/branches/${id}`),

  // Attendance
  clockIn:  (branchId, locOk) => req('POST', '/attendance/clock-in',  { branchId, locOk }),
  clockOut: ()                => req('POST', '/attendance/clock-out'),

  // Leaves
  submitLeave: (data) => req('POST',   '/leaves',            data),
  revokeLeave: (id)   => req('DELETE', `/leaves/${id}`),
  actLeave:    (id, status) => req('PUT', `/leaves/${id}/status`, { status }),

  // Shift templates
  createTemplate: (data)       => req('POST',   '/templates',       data),
  updateTemplate: (id, data)   => req('PUT',    `/templates/${id}`, data),
  deleteTemplate: (id)         => req('DELETE', `/templates/${id}`),

  // Schedules
  assignShift: (data) => req('POST',   '/schedules',       data),
  deleteShift: (id)   => req('DELETE', `/schedules/${id}`),

  // Calendar events
  createEvent: (data) => req('POST',   '/calendar',       data),
  deleteEvent: (id)   => req('DELETE', `/calendar/${id}`),
}
