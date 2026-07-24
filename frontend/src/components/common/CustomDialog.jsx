import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import "./CustomDialog.css";

const CustomDialogContext = createContext(null);

export const useCustomDialog = () => {
  const context = useContext(CustomDialogContext);
  if (!context) {
    throw new Error("useCustomDialog must be used within a CustomDialogProvider");
  }
  return context;
};

export const CustomDialogProvider = ({ children }) => {
  const [dialog, setDialog] = useState(null);
  const primaryButtonRef = useRef(null);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && dialog) {
        // Resolve with false for confirmation, or just close for alert
        dialog.resolve(false);
        setDialog(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dialog]);

  // Focus primary button when dialog opens
  useEffect(() => {
    if (dialog && primaryButtonRef.current) {
      primaryButtonRef.current.focus();
    }
  }, [dialog]);

  const confirm = (options) => {
    return new Promise((resolve) => {
      // support simple string passing as message
      const opts = typeof options === "string" ? { message: options } : options;
      setDialog({
        type: "confirm",
        title: opts.title || "¿Estás seguro?",
        message: opts.message || "",
        confirmText: opts.confirmText || "Sí, guardar",
        cancelText: opts.cancelText || "No, cancelar",
        resolve,
      });
    });
  };

  const alert = (options) => {
    return new Promise((resolve) => {
      const opts = typeof options === "string" ? { message: options } : options;
      setDialog({
        type: opts.type || "info",
        title: opts.title || (opts.type === "success" ? "Éxito" : opts.type === "error" ? "Error" : "Información"),
        message: opts.message || "",
        confirmText: opts.confirmText || "Aceptar",
        resolve,
      });
    });
  };

  const handleConfirm = () => {
    if (dialog) {
      dialog.resolve(true);
      setDialog(null);
    }
  };

  const handleCancel = () => {
    if (dialog) {
      dialog.resolve(false);
      setDialog(null);
    }
  };

  const renderIcon = (type) => {
    switch (type) {
      case "success":
        return (
          <svg className="custom-dialog-svg" viewBox="0 0 52 52">
            <circle className="success-circle" cx="26" cy="26" r="25" />
            <path className="success-check" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
          </svg>
        );
      case "error":
        return (
          <svg className="custom-dialog-svg" viewBox="0 0 52 52">
            <circle className="error-circle" cx="26" cy="26" r="25" />
            <path className="error-cross-1" d="M16 16l20 20" />
            <path className="error-cross-2" d="M36 16L16 36" />
          </svg>
        );
      case "confirm":
      case "info":
      default:
        return (
          <svg className="custom-dialog-svg" viewBox="0 0 52 52">
            <circle className="info-circle" cx="26" cy="26" r="25" />
            <circle className="info-dot" cx="26" cy="16" r="2" />
            <line className="info-line" x1="26" y1="23" x2="26" y2="38" />
          </svg>
        );
    }
  };

  return (
    <CustomDialogContext.Provider value={{ confirm, alert }}>
      {children}
      {dialog && (
        <div className="custom-dialog-overlay" onClick={handleCancel}>
          <div 
            className="custom-dialog-container" 
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="custom-dialog-icon-wrapper">
              {renderIcon(dialog.type)}
            </div>
            
            <h3 className="custom-dialog-title">{dialog.title}</h3>
            {dialog.message && (
              <p className="custom-dialog-message">{dialog.message}</p>
            )}

            <div className="custom-dialog-buttons">
              {dialog.type === "confirm" ? (
                <>
                  <button
                    ref={primaryButtonRef}
                    className="custom-dialog-btn custom-dialog-btn-primary"
                    onClick={handleConfirm}
                  >
                    {dialog.confirmText}
                  </button>
                  <button
                    className="custom-dialog-btn custom-dialog-btn-secondary"
                    onClick={handleCancel}
                  >
                    {dialog.cancelText}
                  </button>
                </>
              ) : (
                <button
                  ref={primaryButtonRef}
                  className="custom-dialog-btn custom-dialog-btn-primary"
                  onClick={handleConfirm}
                >
                  {dialog.confirmText}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </CustomDialogContext.Provider>
  );
};
