import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { io } from "socket.io-client";
import Quill from "quill";
import "quill/dist/quill.snow.css";

const SAVE_INTERVAL_MS = 2000;

const API_URL = (
  import.meta.env.VITE_API_URL ||
  "https://inkwell-collab-editor-api-fsfx.onrender.com"
).replace(/\/+$/, "");

const TOOLBAR_OPTIONS = [
  [{ header: [1, 2, 3, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ list: "ordered" }, { list: "bullet" }],
  [{ align: [] }],
  [{ color: [] }, { background: [] }],
  ["blockquote", "code-block"],
  ["link"],
  ["clean"],
];

export default function Editor() {
  const { id: documentId } = useParams();
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get("share") || "";

  const [shareMessage, setShareMessage] = useState("");
  const [socket, setSocket] = useState(null);
  const [quill, setQuill] = useState(null);
  const [title, setTitle] = useState("Untitled document");
  const [viewers, setViewers] = useState(1);
  const [status, setStatus] = useState("Connecting…");

  const titleTimeout = useRef(null);
  const documentLoaded = useRef(false);
  const saveInProgress = useRef(false);
  const pendingSaveTimeout = useRef(null);

  // Create one socket connection for this editor.
  useEffect(() => {
    const s = io(API_URL, {
      withCredentials: true,
      reconnection: true,
      transports: ["websocket", "polling"],
    });
  }, []);

  // Create the Quill editor once its wrapper is mounted.
  const wrapperRef = useCallback((wrapper) => {
    if (!wrapper) return;

    wrapper.innerHTML = "";
    const editorElement = document.createElement("div");
    wrapper.appendChild(editorElement);

    const q = new Quill(editorElement, {
      theme: "snow",
      modules: { toolbar: TOOLBAR_OPTIONS },
      placeholder: "Start writing…",
    });

    q.disable();
    q.setText("Loading…");
    setQuill(q);
  }, []);

  // Load the document and register socket event listeners.
  useEffect(() => {
    if (!socket || !quill || !documentId) return;

    documentLoaded.current = false;
    saveInProgress.current = false;
    setStatus("Connecting…");
    quill.disable();

    const handleLoadDocument = ({ data, title: documentTitle } = {}) => {
      if (!data || !Array.isArray(data.ops)) {
        setStatus("Load failed");
        console.error("Server returned invalid document data:", data);
        return;
      }

      quill.setContents(data, "silent");
      quill.enable();
      documentLoaded.current = true;
      setTitle(documentTitle || "Untitled document");
      setStatus("Synced");
    };

    const handleDocumentError = (message) => {
      documentLoaded.current = false;
      setStatus("Load failed");
      window.alert(
        `${message || "Could not load this document."}\n\nYou'll be taken back to your document list.`
      );
      window.location.href = "/";
    };

    const handleReceiveChanges = (delta) => {
      if (!documentLoaded.current || !delta || !Array.isArray(delta.ops)) return;
      quill.updateContents(delta, "api");
    };

    const handleViewersUpdate = (count) => setViewers(count);
    const handleConnect = () => {
      if (documentLoaded.current) setStatus("Synced");
    };
    const handleConnectError = (error) => {
      console.error("Socket connection failed:", error.message);
      setStatus("Connection error");
    };
    const handleSaveSuccess = () => {
      saveInProgress.current = false;
      clearTimeout(pendingSaveTimeout.current);
      setStatus("Saved");
    };
    const handleSaveError = (message) => {
      saveInProgress.current = false;
      clearTimeout(pendingSaveTimeout.current);
      console.error("Save failed:", message);
      setStatus("Save failed");
    };
    const handleTitleUpdate = (newTitle) => setTitle(newTitle);

    socket.on("load-document", handleLoadDocument);
    socket.on("document-error", handleDocumentError);
    socket.on("receive-changes", handleReceiveChanges);
    socket.on("viewers-update", handleViewersUpdate);
    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);
    socket.on("save-success", handleSaveSuccess);
    socket.on("save-error", handleSaveError);
    socket.on("title-update", handleTitleUpdate);

    if (socket.connected) {
      socket.emit("get-document", { id: documentId, shareToken });
    } else {
      socket.once("connect", () => {
        socket.emit("get-document", { id: documentId, shareToken });
      });
    }

    return () => {
      socket.off("load-document", handleLoadDocument);
      socket.off("document-error", handleDocumentError);
      socket.off("receive-changes", handleReceiveChanges);
      socket.off("viewers-update", handleViewersUpdate);
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      socket.off("save-success", handleSaveSuccess);
      socket.off("save-error", handleSaveError);
      socket.off("title-update", handleTitleUpdate);
      clearTimeout(pendingSaveTimeout.current);
      documentLoaded.current = false;
    };
  }, [socket, quill, documentId, shareToken]);

  // Send local edits to other viewers. Remote changes are ignored here.
  useEffect(() => {
    if (!socket || !quill) return;

    const handleChange = (delta, oldDelta, source) => {
      if (source !== "user" || !documentLoaded.current) return;
      setStatus("Editing…");
      socket.emit("send-changes", delta);
    };

    quill.on("text-change", handleChange);
    return () => quill.off("text-change", handleChange);
  }, [socket, quill]);

  // Autosave only after the initial document has loaded.
  useEffect(() => {
    if (!socket || !quill) return;

    const interval = setInterval(() => {
      if (
        !socket.connected ||
        !documentLoaded.current ||
        saveInProgress.current
      ) {
        return;
      }

      saveInProgress.current = true;
      setStatus("Saving…");
      socket.emit("save-document", quill.getContents());

      // Prevent the UI from remaining stuck if the server never acknowledges.
      clearTimeout(pendingSaveTimeout.current);
      pendingSaveTimeout.current = setTimeout(() => {
        if (saveInProgress.current) {
          saveInProgress.current = false;
          setStatus("Save timed out");
        }
      }, 8000);
    }, SAVE_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(pendingSaveTimeout.current);
      saveInProgress.current = false;
    };
  }, [socket, quill]);

  function handleTitleChange(event) {
    const newTitle = event.target.value;
    setTitle(newTitle);

    clearTimeout(titleTimeout.current);
    titleTimeout.current = setTimeout(() => {
      if (socket?.connected && documentLoaded.current) {
        socket.emit("title-change", newTitle);
      }
    }, 500);
  }

  useEffect(() => {
    return () => clearTimeout(titleTimeout.current);
  }, []);

  async function handleShare() {
  setShareMessage("Generating share link...");

  try {
    const response = await fetch(`${API_URL}/api/documents/${documentId}/share`, {
        method: "POST",
        credentials: "include",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Could not create share link."
      );
    }

    const url = `${window.location.origin}/doc/${documentId}?share=${encodeURIComponent(data.token)}`;

    try {
      await navigator.clipboard.writeText(url);

      setShareMessage(
        "✓ Share link copied! Anyone with the link and an Inkwell account can edit."
      );
    } catch {
      setShareMessage(
        `Share link created. Copy this link manually: ${url}`
      );
    }
  } catch (error) {
    setShareMessage(
      `✕ ${error.message || "Could not create share link."}`
    );
  }
}

  return (
    <div className="editor-page">
      <div className="editor-topbar">
        <Link to="/" className="back-link">
          ← All documents
        </Link>

        <input
          className="title-input"
          value={title}
          onChange={handleTitleChange}
          maxLength={120}
          aria-label="Document title"
        />

        {!shareToken && (
          <button
            className="text-button share-button"
            onClick={handleShare}
            type="button"
          >
            Share
          </button>
        )}

        <div className="editor-status">
          <span
            className={
              "status-dot " +
              (status === "Synced" || status === "Saved" ? "ok" : "")
            }
          />
          {status}
          <span
            className="viewers-badge"
            title="People currently viewing this document"
          >
            👁 {viewers}
          </span>
        </div>
      </div>

      {shareMessage && (
        <div className="share-message" role="status">
          {shareMessage}
          <button
            onClick={() => setShareMessage("")}
            aria-label="Dismiss"
            type="button"
          >
            ×
          </button>
        </div>
      )}

      <div className="editor-wrapper" ref={wrapperRef} />
    </div>
  );
}
