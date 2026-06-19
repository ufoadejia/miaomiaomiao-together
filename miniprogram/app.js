"use strict";
// app.ts
App({
    globalData: {
        apiBaseUrl: 'https://tantanzhang.cn/dish-api',
    },
    onLaunch() {
        wx.setStorageSync('lastOpenAt', Date.now());
    },
});
