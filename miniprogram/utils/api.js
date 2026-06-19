"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApiBaseUrl = getApiBaseUrl;
exports.request = request;
exports.getStoredToken = getStoredToken;
exports.getStoredProfile = getStoredProfile;
exports.isRegistered = isRegistered;
exports.logout = logout;
exports.registerOrLogin = registerOrLogin;
exports.rankings = rankings;
exports.categories = categories;
exports.announcement = announcement;
exports.canteenData = canteenData;
exports.adminLogin = adminLogin;
exports.dishes = dishes;
exports.updateDish = updateDish;
exports.setAnnouncement = setAnnouncement;
exports.createCategory = createCategory;
exports.rateDish = rateDish;
exports.uploadDish = uploadDish;
const API_BASE_STORAGE_KEY = 'dishApiBaseUrl';
const TOKEN_STORAGE_KEY = 'dishUserToken';
const PROFILE_STORAGE_KEY = 'dishUserProfile';
const DEFAULT_API_BASE_URL = 'https://tantanzhang.cn/dish-api';
function trimTrailingSlash(value) {
    return value.replace(/\/+$/, '');
}
function getApiBaseUrl() {
    const app = getApp();
    const storedBaseUrl = wx.getStorageSync(API_BASE_STORAGE_KEY);
    return trimTrailingSlash(storedBaseUrl || app.globalData.apiBaseUrl || DEFAULT_API_BASE_URL);
}
function queryString(params) {
    const parts = Object.keys(params)
        .filter((key) => params[key] !== undefined && params[key] !== '')
        .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`);
    return parts.length ? `?${parts.join('&')}` : '';
}
function authHeader(token) {
    return token ? { Authorization: `Bearer ${token}` } : {};
}
function cleanPayload(payload) {
    const data = {};
    Object.keys(payload).forEach((key) => {
        const value = payload[key];
        if (value !== undefined && value !== '')
            data[key] = value;
    });
    return data;
}
function unwrap(body) {
    if (body.success === false)
        throw new Error(body.message || '请求失败');
    return body.data;
}
function request(path, options = {}) {
    return new Promise((resolve, reject) => {
        wx.request({
            url: `${getApiBaseUrl()}${path}`,
            method: options.method || 'GET',
            data: options.data,
            header: {
                'Content-Type': 'application/json',
                ...authHeader(options.token),
            },
            success(res) {
                const body = res.data || {};
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(body.message || `请求失败：${res.statusCode}`));
                    return;
                }
                try {
                    resolve(unwrap(body));
                }
                catch (error) {
                    reject(error);
                }
            },
            fail(err) {
                reject(new Error(err.errMsg || '网络请求失败'));
            },
        });
    });
}
function wxLogin() {
    return new Promise((resolve, reject) => {
        wx.login({
            success(res) {
                if (res.code) {
                    resolve(res.code);
                }
                else {
                    reject(new Error('微信登录失败'));
                }
            },
            fail(err) {
                reject(new Error(err.errMsg || '微信登录失败'));
            },
        });
    });
}
function getStoredToken() {
    return wx.getStorageSync(TOKEN_STORAGE_KEY) || '';
}
function getStoredProfile() {
    const raw = wx.getStorageSync(PROFILE_STORAGE_KEY);
    if (!raw || typeof raw !== 'object')
        return null;
    const profile = raw;
    if (!profile.nickname)
        return null;
    return { nickname: profile.nickname, avatarUrl: profile.avatarUrl || '' };
}
function isRegistered() {
    return Boolean(getStoredToken() && getStoredProfile());
}
function logout() {
    wx.removeStorageSync(TOKEN_STORAGE_KEY);
    wx.removeStorageSync(PROFILE_STORAGE_KEY);
}
async function registerOrLogin(profile) {
    const code = await wxLogin();
    const data = await request('/auth/wechat', {
        method: 'POST',
        data: { code, nickname: profile.nickname, avatarUrl: profile.avatarUrl },
    });
    wx.setStorageSync(TOKEN_STORAGE_KEY, data.token);
    wx.setStorageSync(PROFILE_STORAGE_KEY, profile);
    return data.token;
}
function rankings(schoolId = 'bistu', limit = 20) {
    return request(`/rankings${queryString({ schoolId, limit })}`);
}
function categories(schoolId = 'bistu') {
    return request(`/categories${queryString({ schoolId })}`);
}
function announcement(schoolId = 'bistu') {
    return request(`/announcements${queryString({ schoolId })}`);
}
function canteenData(schoolId = 'bistu') {
    return request('/miniprogram/call', {
        method: 'POST',
        data: { action: 'getCanteenData', schoolId },
    });
}
function adminLogin(password) {
    return request('/admin/login', {
        method: 'POST',
        data: { password },
    });
}
function dishes(schoolId = 'bistu', includeOffline = false) {
    return request(`/dishes${queryString({
        schoolId,
        includeOffline: includeOffline ? 1 : 0,
        limit: 200,
    })}`);
}
function updateDish(token, dishId, patch) {
    return request(`/dishes/${dishId}`, {
        method: 'PUT',
        token,
        data: patch,
    });
}
function setAnnouncement(token, schoolId, content) {
    return request('/announcements', {
        method: 'PUT',
        token,
        data: { schoolId, content },
    });
}
function createCategory(token, schoolId, name) {
    return request('/categories', {
        method: 'POST',
        token,
        data: { schoolId, name },
    });
}
function rateDish(token, dishId, score) {
    return request('/ratings', {
        method: 'POST',
        token,
        data: { dishId, score },
    });
}
function uploadDish(token, payload, imagePath) {
    const formData = cleanPayload({
        schoolId: payload.schoolId,
        name: payload.name,
        categoryName: payload.categoryName || '',
        description: payload.description || '',
        shopName: payload.shopName || '',
        floorName: payload.floorName || '',
    });
    if (!imagePath) {
        return request('/dishes', {
            method: 'POST',
            token,
            data: formData,
        });
    }
    return new Promise((resolve, reject) => {
        wx.uploadFile({
            url: `${getApiBaseUrl()}/dishes`,
            filePath: imagePath,
            name: 'image',
            formData,
            header: authHeader(token),
            success(res) {
                let body = {};
                try {
                    body = JSON.parse(res.data);
                }
                catch (error) {
                    reject(new Error('上传响应解析失败'));
                    return;
                }
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(body.message || `上传失败：${res.statusCode}`));
                    return;
                }
                try {
                    resolve(unwrap(body));
                }
                catch (error) {
                    reject(error);
                }
            },
            fail(err) {
                reject(new Error(err.errMsg || '上传失败'));
            },
        });
    });
}
