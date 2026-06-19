const API_BASE = import.meta.env.VITE_API_BASE || '/dish-api';

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `请求失败：${res.status}`);
  }
  return data.data ?? data;
}

export const api = {
  webLogin(nickname) {
    return request('/auth/web', {
      method: 'POST',
      body: JSON.stringify({ nickname })
    });
  },
  adminLogin(password) {
    return request('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  },
  schools() {
    return request('/schools');
  },
  categories(schoolId) {
    return request(`/categories${schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : ''}`);
  },
  rankings(schoolId) {
    return request(`/rankings?limit=50${schoolId ? `&schoolId=${encodeURIComponent(schoolId)}` : ''}`);
  },
  dishes(schoolId, includeOffline = false) {
    return request(`/dishes?limit=200&includeOffline=${includeOffline ? '1' : '0'}${schoolId ? `&schoolId=${encodeURIComponent(schoolId)}` : ''}`);
  },
  uploadDish(token, formData) {
    return request('/dishes', {
      method: 'POST',
      body: formData,
      headers: authHeaders(token)
    });
  },
  rate(token, dishId, score) {
    return request('/ratings', {
      method: 'POST',
      body: JSON.stringify({ dishId, score }),
      headers: authHeaders(token)
    });
  },
  updateDish(adminToken, dishId, patch) {
    return request(`/dishes/${dishId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
      headers: authHeaders(adminToken)
    });
  },
  setAnnouncement(adminToken, schoolId, content) {
    return request('/announcements', {
      method: 'PUT',
      body: JSON.stringify({ schoolId, content }),
      headers: authHeaders(adminToken)
    });
  },
  createCategory(adminToken, schoolId, name) {
    return request('/categories', {
      method: 'POST',
      body: JSON.stringify({ schoolId, name }),
      headers: authHeaders(adminToken)
    });
  }
};
