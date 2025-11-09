import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import './LandingPage.css';

const UserIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);

const LandingPage = ({ user }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [publicRooms, setPublicRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [expandedDescription, setExpandedDescription] = useState(null);

  const handleCreateRoom = async () => {
    if (!user) {
      setError('Please sign in to create a room.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Get current user ID
      const currentUserId = user.id;

      // Generate unique 6-digit alphanumeric code
      let roomCode;
      let codeExists = true;
      let attempts = 0;
      const maxAttempts = 10;

      while (codeExists && attempts < maxAttempts) {
        // Generate random 6-character code (A-Z, 0-9)
        roomCode = Array.from({ length: 6 }, () => {
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          return chars[Math.floor(Math.random() * chars.length)];
        }).join('');

        // Check if code exists
        const { data: existing, error: checkError } = await supabase
          .from('rooms')
          .select('room_code')
          .eq('room_code', roomCode)
          .maybeSingle();

        codeExists = !!existing && !checkError;
        attempts++;
      }

      if (attempts >= maxAttempts) {
        throw new Error('Failed to generate unique room code');
      }

      // Create room
      const { data: room, error: createError } = await supabase
        .from('rooms')
        .insert({
          room_code: roomCode,
          master_id: currentUserId,
          name: `Room ${roomCode}`,
          is_public: false,
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      // Add creator as master participant
      const { error: participantError } = await supabase
        .from('room_participants')
        .insert({
          room_code: room.room_code,
          user_id: room.master_id,
          is_master: true,
        });

      if (participantError) {
        console.error('Error adding participant:', participantError);
        // Still navigate even if participant insert fails
      }

      navigate(`/room/${room.room_code}`);
    } catch (err) {
      console.error('Error creating room:', err);
      setError('Failed to create room. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = () => {
    navigate('/join');
  };

  useEffect(() => {
    loadPublicRooms();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('landing-public-rooms')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: 'is_public=eq.true',
        },
        () => {
          loadPublicRooms();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadPublicRooms = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('rooms')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;

      // Get participant counts and creator usernames for each room
      const roomsWithCounts = await Promise.all(
        (data || []).map(async (room) => {
          const { count } = await supabase
            .from('room_participants')
            .select('*', { count: 'exact', head: true })
            .eq('room_code', room.room_code);

          // Get creator's username (or email as fallback)
          let creatorUsername = null;
          try {
            const { data: creatorProfile, error: profileError } = await supabase
              .from('profiles')
              .select('username, email')
              .eq('id', room.master_id)
              .maybeSingle();
            
            if (!profileError && creatorProfile) {
              // Use username if available, otherwise use email prefix, otherwise use email
              creatorUsername = creatorProfile.username || 
                               creatorProfile.email?.split('@')[0] || 
                               creatorProfile.email || 
                               null;
            }
          } catch (err) {
            console.error('Error fetching creator profile:', err);
          }

          return {
            ...room,
            participant_count: count || 0,
            creator_username: creatorUsername,
          };
        })
      );

      setPublicRooms(roomsWithCounts);
    } catch (err) {
      console.error('Error loading public rooms:', err);
    } finally {
      setLoadingRooms(false);
    }
  };

  const handleJoinPublicRoom = async (roomCode) => {
    try {
      if (!user) {
        setError('Please sign in to join a room.');
        return;
      }

      const currentUser = user;

      // Check if room exists and get planning status
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('planning_started')
        .eq('room_code', roomCode)
        .single();

      if (roomError || !room) {
        setError('Room not found or has been deleted.');
        // Reload public rooms list to remove deleted room
        loadPublicRooms();
        return;
      }

      // If planning has already started, redirect to planning page immediately
      if (room.planning_started) {
        const { data: existing } = await supabase
          .from('room_participants')
          .select('*')
          .eq('room_code', roomCode)
          .eq('user_id', currentUser.id)
          .maybeSingle();

        if (!existing) {
          await supabase
            .from('room_participants')
            .insert({
              room_code: roomCode,
              user_id: currentUser.id,
              is_master: false,
            });
        }

        navigate(`/planning/${roomCode}`);
        return;
      }

      // Check current participant count
      const { count: participantCount } = await supabase
        .from('room_participants')
        .select('*', { count: 'exact', head: true })
        .eq('room_code', roomCode);

      // Check if room is full (max 4 people)
      if (participantCount >= 4) {
        setError('Room is full. Maximum 4 people allowed per room.');
        return;
      }

      // Check if user is already in the room
      const { data: existing } = await supabase
        .from('room_participants')
        .select('*')
        .eq('room_code', roomCode)
        .eq('user_id', currentUser.id)
        .maybeSingle();

      // Only insert if user is not already in the room
      if (!existing) {
        const { error: joinError } = await supabase
          .from('room_participants')
          .insert({
            room_code: roomCode,
            user_id: currentUser.id,
            is_master: false,
          });

        if (joinError && joinError.code !== '23505') {
          throw joinError;
        }
      }

      navigate(`/room/${roomCode}`);
    } catch (err) {
      console.error('Error joining room:', err);
      setError('Failed to join room. Please try again.');
    }
  };

  return (
    <div className="landing-page">
      {user && (
        <div className="profile-section-top">
          <div className="profile-info">
            <UserIcon className="profile-icon" />
            <span className="profile-email">{user.email}</span>
          </div>
          <button
            className="btn-profile-signout"
            onClick={async () => {
              await supabase.auth.signOut();
            }}
          >
            Sign Out
          </button>
        </div>
      )}
      <div className="landing-container">
        <h1 className="landing-title">WellWorld</h1>
        <p className="landing-subtitle">Plan your social-good journey together</p>

        {error && <div className="error-message">{error}</div>}

        <div className="button-group">
          <button
            className="btn btn-primary"
            onClick={handleCreateRoom}
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Room'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={handleJoinRoom}
            disabled={loading}
          >
            Join Private Room
          </button>
        </div>

        {/* Public Rooms Section */}
        <div className="public-rooms-section">
          <h2 className="public-rooms-title">Public Rooms</h2>
          <p className="public-rooms-subtitle">
            Join open rooms and connect with like-minded travelers.
          </p>

          {loadingRooms ? (
            <div className="loading-rooms">Loading public rooms...</div>
          ) : publicRooms.length === 0 ? (
            <div className="no-public-rooms">
              <p>No public rooms available at the moment.</p>
            </div>
          ) : (
            <div className="public-rooms-list">
              {publicRooms.map((room) => (
                <div key={room.id} className="public-room-card">
                  <div className="public-room-info">
                    <div className="public-room-header">
                      <h3 className="public-room-name">
                        {room.name || `Room ${room.room_code}`}
                      </h3>
                      {room.description && (
                        <button
                          className="btn-dots"
                          onClick={() => setExpandedDescription(
                            expandedDescription === room.id ? null : room.id
                          )}
                          aria-label="Show description"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="1"/>
                            <circle cx="12" cy="5" r="1"/>
                            <circle cx="12" cy="19" r="1"/>
                          </svg>
                        </button>
                      )}
                    </div>
                    <p className="public-room-code">Code: {room.room_code}</p>
                    <p className="public-room-meta">
                      {room.participant_count} member{room.participant_count !== 1 ? 's' : ''} • Active now
                      {room.creator_username ? (
                        <span className="public-room-creator">
                          {' • Created by '}
                          <span className="creator-name">{room.creator_username}</span>
                        </span>
                      ) : (
                        <span className="public-room-creator">
                          {' • Created by '}
                          <span className="creator-name">Unknown</span>
                        </span>
                      )}
                    </p>
                    {expandedDescription === room.id && room.description && (
                      <div className="public-room-description">
                        <p>{room.description}</p>
                      </div>
                    )}
                  </div>
                  <button
                    className="btn btn-join-public"
                    onClick={() => handleJoinPublicRoom(room.room_code)}
                    disabled={loading}
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LandingPage;

