import { useState, useEffect } from 'react';
import './App.css';
import UpdateNotification from './components/UpdateNotification';

const API_URL = 'http://127.0.0.1:8000';

function App() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState(null);
  const [backendStatus, setBackendStatus] = useState('checking...');
  const [electronInfo, setElectronInfo] = useState(null);

  useEffect(() => {
    if (window.electronAPI) {
      setElectronInfo(window.electronAPI);
    }

    fetch(`${API_URL}/api/health`)
      .then((res) => res.json())
      .then((data) => setBackendStatus(data.status))
      .catch(() => setBackendStatus('offline'));
  }, []);

  const sendMessage = async () => {
    if (!message.trim()) return;

    try {
      const res = await fetch(`${API_URL}/api/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });
      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setResponse({ message: 'Failed to connect to backend', status: 'error' });
    }
  };

  return (
    <div className="app">
      <h1>Electron + React + FastAPI</h1>

      <UpdateNotification />

      <div className="status-card">
        <h2>System Status</h2>
        <p>
          <strong>Backend:</strong>{' '}
          <span className={backendStatus === 'healthy' ? 'online' : 'offline'}>
            {backendStatus}
          </span>
        </p>
        {electronInfo && (
          <div className="electron-info">
            <p><strong>Platform:</strong> {electronInfo.platform}</p>
            <p><strong>Electron:</strong> {electronInfo.versions.electron}</p>
            <p><strong>Chrome:</strong> {electronInfo.versions.chrome}</p>
            <p><strong>Node.js:</strong> {electronInfo.versions.node}</p>
          </div>
        )}
      </div>

      <div className="message-card">
        <h2>Test API</h2>
        <div className="input-group">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter a message..."
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          />
          <button onClick={sendMessage}>Send</button>
        </div>
        {response && (
          <div className={`response ${response.status}`}>
            <p>{response.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
