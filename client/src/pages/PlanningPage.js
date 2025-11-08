import React from 'react';
import { useParams } from 'react-router-dom';
import './PlanningPage.css';

const PlanningPage = ({ user }) => {
  const { code } = useParams();
  const roomCode = (code || '').toString().toUpperCase();

  return (
    <div className="planning-page">
      <div className="planning-header">
        <h1>Planning Room: {roomCode}</h1>
      </div>
      <div className="planning-content">
        <div className="planning-placeholder">
          <p>Planning page - Globe and map features will be added here</p>
        </div>
      </div>
    </div>
  );
};

export default PlanningPage;

