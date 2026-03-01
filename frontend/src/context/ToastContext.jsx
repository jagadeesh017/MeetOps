import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ToastContext = createContext({ showToast: () => {} });

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    if (!message) return;
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const bgClass = toast?.type === 'error'
    ? 'bg-red-600'
    : toast?.type === 'success'
    ? 'bg-green-600'
    : 'bg-gray-900';

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center justify-center">
          <div className={`${bgClass} text-white text-sm px-4 py-3 rounded-lg shadow-lg flex items-start gap-3 max-w-sm`}>
            <span className="mt-0.5">
              {toast.type === 'error' ? '⚠️' : toast.type === 'success' ? '✅' : 'ℹ️'}
            </span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
