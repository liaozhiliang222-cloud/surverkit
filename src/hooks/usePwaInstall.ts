import { useCallback, useEffect, useState } from "react";

// 扩展 beforeinstallprompt 事件类型（浏览器未标准化）
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

/**
 * PWA 安装能力探测：
 * - installable: 浏览器已抛出 beforeinstallprompt，可主动调用 prompt()
 * - installed: 已安装（appinstalled 事件或处于 standalone 显示模式）
 * - isIOS: iOS Safari 不抛 beforeinstallprompt，需引导用户用「分享 → 添加到主屏幕」
 */
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  const [isIOS] = useState(() => {
    if (typeof navigator === "undefined") return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
  });

  useEffect(() => {
    // 已处于独立窗口（从主屏打开）视为已安装
    if (typeof window !== "undefined" && window.matchMedia) {
      if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    }

    const onPrompt = (e: Event) => {
      // 拦截默认迷你安装条，改为由我们自己的按钮触发
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt as EventListener);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt as EventListener);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return choice.outcome === "accepted";
  }, [deferredPrompt]);

  return {
    installable: !!deferredPrompt,
    installed,
    isIOS,
    promptInstall,
  };
}
