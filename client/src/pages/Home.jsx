import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../state/AuthContext.jsx";

export default function Home() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadDocs();
  }, []);

  async function loadDocs() {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest(`/api/documents`);
      setDocs(data);
    } catch (err) {
      setError("Couldn't load your documents. " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function createDoc(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const doc = await apiRequest(`/api/documents`, { method: "POST", body: JSON.stringify({ title: newTitle || "Untitled document" }) });
      navigate(`/doc/${doc._id}`);
    } catch (err) {
      setError("Couldn't create document: " + err.message);
    } finally {
      setCreating(false);
    }
  }

  async function deleteDoc(id, e) {
    e.stopPropagation();
    if (!confirm("Delete this document? This can't be undone.")) return;
    try { await apiRequest(`/api/documents/${id}`, { method: "DELETE" }); setDocs(current => current.filter(d => d._id !== id)); } catch (err) { setError("Could not delete document: " + err.message); }
  }

  return (
    <div className="home">
      <section className="hero">
        <p className="eyebrow">Real-time collaborative editing</p>
        <h1>Write together, live.</h1>
        <p className="hero-sub">
          Every keystroke syncs instantly across everyone viewing a document — no save button, no conflicts, no refresh.
        </p>

        <form className="create-form" onSubmit={createDoc}>
          <input
            type="text"
            placeholder="Name your document…"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            maxLength={120}
          />
          <button type="submit" disabled={creating}>
            {creating ? "Creating…" : "+ New document"}
          </button>
        </form>
      </section>

      <section className="doc-list-section">
        <h2>Your documents</h2>

        {loading && <p className="muted">Loading documents…</p>}
        {error && <p className="error-text">{error}</p>}

        {!loading && !error && docs.length === 0 && (
          <div className="empty-state">
            <p>No documents yet.</p>
            <p className="muted">Create your first one above — it opens immediately, ready to edit.</p>
          </div>
        )}

        <div className="doc-grid">
          {docs.map(doc => (
            <div
              key={doc._id}
              className="doc-card"
              role="button" tabIndex={0}
              onKeyDown={e => { if (e.key === "Enter") navigate(`/doc/${doc._id}`); }}
              onClick={() => navigate(`/doc/${doc._id}`)}
            >
              <div className="doc-card-icon">📄</div>
              <div className="doc-card-body">
                <div className="doc-card-title">{doc.title || "Untitled document"}</div>
                <div className="doc-card-meta">
                  Edited {new Date(doc.updatedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                </div>
              </div>
              <button className="doc-delete-btn" onClick={(e) => deleteDoc(doc._id, e)} title="Delete">✕</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
