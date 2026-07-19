import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { initDb } from './db';
import { registerSW } from 'virtual:pwa-register';

initDb().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>
  );
});

// 注册 Service Worker，并在检测到更新时自动刷新页面
// 避免用户卡在旧缓存版本
registerSW({
  onNeedRefresh() {
    // 检测到新版本，自动刷新（无需用户确认）
    if (confirm('发现新版本，是否刷新以更新到最新版？')) {
      window.location.reload();
    }
  },
  onOfflineReady() {
    console.info('PWA 已就绪，可离线使用');
  },
});
