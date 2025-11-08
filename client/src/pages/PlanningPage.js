import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import GlobeComponent from '../components/globe';
import './PlanningPage.css';

const PlanningPage = ({ user }) => {
  const { code } = useParams();
  const navigate = useNavigate();
  const roomCode = (code || '').toString().toUpperCase();
  const [loading, setLoading] = useState(true);
  const [roomExists, setRoomExists] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      if (!user) {
        navigate('/login');
        return;
      }

      // Verify room exists and planning has started
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('planning_started')
        .eq('room_code', roomCode)
        .single();

      if (roomError || !room) {
        setError('Room not found or has been deleted.');
        setLoading(false);
        return;
      }

      if (!room.planning_started) {
        // Planning hasn't started yet, redirect to room page
        navigate(`/room/${roomCode}`);
        return;
      }

      // Verify user is a participant
      const { data: participant } = await supabase
        .from('room_participants')
        .select('*')
        .eq('room_code', roomCode)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!participant) {
        // User is not a participant, add them
        await supabase
          .from('room_participants')
          .insert({
            room_code: roomCode,
            user_id: user.id,
            is_master: false,
          });
      }

      setRoomExists(true);
      setLoading(false);
    })();
  }, [user, roomCode, navigate]);

  if (loading) {
    return (
      <div className="planning-page">
        <div className="planning-loading">
          <p>Loading planning session...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="planning-page">
        <div className="planning-error">
          <p>{error}</p>
          <button onClick={() => navigate('/')} className="btn btn-primary">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (!roomExists) {
    return null;
  }

  return (
    <div className="planning-page">
      <div className="planning-header">
        <h1>Planning Room: {roomCode}</h1>
      </div>
      <div className="planning-content">
        <GlobeComponent />
      </div>
    </div>
  );
};

export default PlanningPage;

