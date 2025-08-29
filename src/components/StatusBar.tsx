import React from 'react';
import { useProjectStore } from '../stores/projectStore';

const StatusBar: React.FC = () => {
  const { currentStatus } = useProjectStore();

  return (
    <div className="status-bar">
      <div className="status-left">
        {currentStatus}
      </div>
      <div className="status-right">
        <span>K.G.Studio (v{__APP_VERSION__})</span>
      </div>
    </div>
  );
};

export default StatusBar; 