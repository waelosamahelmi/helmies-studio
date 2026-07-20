"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import { IconBolt, IconArrowUpRight } from "@/components/Icons";

export default function SettingsPage() {
  const [keys, setKeys] = useState([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState(null);
  const [credits, setCredits] = useState(null);

  const loadKeys = () => {
    fetch("/api/user/keys").then((r) => r.json()).then(setKeys).catch(() => {});
  };
  const loadCredits = () => {
    fetch("/api/credits").then((r) => r.json()).then((d) => setCredits(d)).catch(() => {});
  };

  useEffect(() => { loadKeys(); loadCredits(); }, []);

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    const res = await fetch("/api/user/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName }),
    });
    const data = await res.json();
    if (data.key) {
      setNewKey(data.key);
      setNewKeyName("");
      loadKeys();
    }
  };

  const deleteKey = async (id) => {
    await fetch("/api/user/keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadKeys();
  };

  return (
    <>
      <Navbar />
      <div className="page settings">
        <div className="settings__header">
          <h1>Settings</h1>
          <p>Manage your account, API keys, and credits.</p>
        </div>

        <div className="settings__section">
          <h3>Credits</h3>
          <div className="settings__credits">
            <div className="settings__credits-card">
              <span className="settings__credits-value"><IconBolt /> {credits?.credits || 0}</span>
              <span className="settings__credits-label">Available credits</span>
            </div>
            <div className="settings__credits-card">
              <span className="settings__credits-value">{credits?.plan || "free"}</span>
              <span className="settings__credits-label">Current plan</span>
            </div>
          </div>
        </div>

        <div className="settings__section">
          <h3>API Keys</h3>
          <p className="settings__hint">Use these keys to access Helmies Studio programmatically via the REST API.</p>

          <div className="settings__add-key">
            <input className="field-input" placeholder="Key name (e.g. My App)" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
            <button className="btn btn-primary btn-sm" onClick={createKey} disabled={!newKeyName.trim()}>Create Key</button>
          </div>

          {newKey && (
            <div className="settings__key-reveal">
              <p>Your API key (shown only once):</p>
              <code>{newKey}</code>
              <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(newKey)}>Copy</button>
            </div>
          )}

          <div className="settings__keys-list">
            {keys.map((k) => (
              <div key={k.id} className="settings__key">
                <div>
                  <strong>{k.name}</strong>
                  <span className="settings__key-prefix">{k.keyPrefix}</span>
                </div>
                <div className="settings__key-meta">
                  <span>Created {new Date(k.createdAt).toLocaleDateString()}</span>
                  {k.lastUsedAt && <span>Last used {new Date(k.lastUsedAt).toLocaleDateString()}</span>}
                  <span className={`admin__badge ${k.isActive ? "enabled" : "disabled"}`}>{k.isActive ? "Active" : "Revoked"}</span>
                </div>
                <button className="btn-ghost" onClick={() => deleteKey(k.id)}>Revoke</button>
              </div>
            ))}
            {keys.length === 0 && <p className="admin__empty">No API keys yet.</p>}
          </div>
        </div>
      </div>
    </>
  );
}