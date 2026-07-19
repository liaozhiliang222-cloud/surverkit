import { useStore } from "./store";

export function ToastContainer() {
  const toasts = useStore((s) => s.toasts);
  const removeToast = useStore((s) => s.removeToast);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg transition-all ${
            toast.type === "success"
              ? "bg-teal-600"
              : toast.type === "error"
                ? "bg-red-500"
                : "bg-slate-700"
          }`}
        >
          <span>{toast.message}</span>
          <button
            className="text-white/70 hover:text-white"
            onClick={() => removeToast(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
