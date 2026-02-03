import { useState, useEffect } from 'react';
import './UpdateNotification.css';

function UpdateNotification() {
  const [appVersion, setAppVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState(null);
  const [updateVersion, setUpdateVersion] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    const api = window.electronAPI?.updates;
    if (!api) return;

    api.getAppVersion().then(setAppVersion);

    const unsubscribe = api.onUpdateStatus((data) => {
      setUpdateStatus(data.status);
      setIsChecking(false);

      switch (data.status) {
        case 'available':
          setUpdateVersion(data.version);
          break;
        case 'downloading':
          setDownloadProgress(data.percent || 0);
          break;
        case 'downloaded':
          setUpdateVersion(data.version);
          break;
        case 'error':
          setErrorMessage(data.message || 'Update failed');
          break;
        default:
          break;
      }
    });

    return unsubscribe;
  }, []);

  const handleCheckForUpdates = async () => {
    const api = window.electronAPI?.updates;
    if (!api) return;

    setIsChecking(true);
    setUpdateStatus(null);
    setErrorMessage('');

    const result = await api.checkForUpdates();
    if (result.status === 'dev-mode') {
      setUpdateStatus('dev-mode');
      setIsChecking(false);
    } else if (result.status === 'error') {
      setUpdateStatus('error');
      setErrorMessage(result.message);
      setIsChecking(false);
    }
  };

  const handleInstallUpdate = () => {
    window.electronAPI?.updates?.installUpdate();
  };

  const handleDismiss = () => {
    setUpdateStatus(null);
  };

  if (!window.electronAPI?.updates) {
    return null;
  }

  return (
    <div className="update-notification">
      <div className="update-version">
        <span>Version {appVersion || '...'}</span>
        {!updateStatus && (
          <button
            className="check-updates-btn"
            onClick={handleCheckForUpdates}
            disabled={isChecking}
          >
            {isChecking ? 'Checking...' : 'Check for Updates'}
          </button>
        )}
      </div>

      {updateStatus === 'checking' && (
        <div className="update-status checking">
          Checking for updates...
        </div>
      )}

      {updateStatus === 'not-available' && (
        <div className="update-status up-to-date">
          You're up to date!
        </div>
      )}

      {updateStatus === 'available' && (
        <div className="update-status available">
          Update {updateVersion} available - downloading...
        </div>
      )}

      {updateStatus === 'downloading' && (
        <div className="update-status downloading">
          <div className="download-text">
            Downloading update... {downloadProgress.toFixed(0)}%
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
        </div>
      )}

      {updateStatus === 'downloaded' && (
        <div className="update-status downloaded">
          <div className="download-text">
            Update {updateVersion} ready to install
          </div>
          <div className="update-actions">
            <button className="install-btn" onClick={handleInstallUpdate}>
              Restart Now
            </button>
            <button className="later-btn" onClick={handleDismiss}>
              Later
            </button>
          </div>
        </div>
      )}

      {updateStatus === 'error' && (
        <div className="update-status error">
          <div className="error-text">Update error: {errorMessage}</div>
          <button className="retry-btn" onClick={handleCheckForUpdates}>
            Retry
          </button>
        </div>
      )}

      {updateStatus === 'dev-mode' && (
        <div className="update-status dev-mode">
          Updates disabled in development mode
        </div>
      )}
    </div>
  );
}

export default UpdateNotification;
