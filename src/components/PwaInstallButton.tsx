import { useEffect, useState } from "react";
import { usePwaInstall } from "../hooks/usePwaInstall";

const DISMISS_KEY = "pwa-install-dismissed";

/**
 * 全局「安装应用」浮动按钮：
 * - Chrome / Edge / 桌面：捕获 beforeinstallprompt 后主动弹系统的安装对话框
 * - iOS Safari：不抛该事件，改为弹出「分享 → 添加到主屏幕」引导
 * - 已安装或用户手动关闭后不再显示（关闭状态写入 localStorage）
 */
export function PwaInstallButton() {
  const { installable, installed, isIOS, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(false);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      /* localStorage 不可用时忽略 */
    }
  }, []);

  if (installed) return null;
  const visible = !dismissed && (installable || isIOS);
  if (!visible) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <div className="fixed bottom-20 right-4 z-40 flex items-center gap-2 lg:bottom-6">
        <button
          type="button"
          onClick={() => (isIOS ? setShowIos(true) : void promptInstall())}
          className="flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-950/20 transition hover:bg-brand-700 active:scale-95"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 3v11.17l2.59-2.58L16 13l-4 4-4-4 1.41-1.41L11 14.17V3h2zm-6 14h12v2H6z" />
          </svg>
          安装应用
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="不再提示"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/70 text-sm text-white/90 backdrop-blur transition hover:bg-slate-900"
        >
          ×
        </button>
      </div>

      {showIos && <IosGuide onClose={() => setShowIos(false)} />}
    </>
  );
}

function IosGuide({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-900">添加到主屏幕</h3>
        <p className="mt-2 text-sm text-slate-600">
          iOS 设备请通过 Safari 的系统菜单安装：
        </p>
        <ol className="mt-4 space-y-3 text-sm text-slate-700">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">1</span>
            <span>点击底部工具栏的 <b>分享</b> 图标（▢↑）</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">2</span>
            <span>向上滑动找到并点击 <b>「添加到主屏幕」</b></span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">3</span>
            <span>点击右上角 <b>「添加」</b> 即可在桌面打开 App</span>
          </li>
        </ol>
        <button
          type="button"
          onClick={onClose}
          className="btn-primary mt-6 w-full"
        >
          知道了
        </button>
      </div>
    </div>
  );
}
