import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import './OpportunitiesPanel.css';

const OpportunitiesPanel = ({ roomCode, onOpportunitySelect, selectedCountry, onOpportunitiesChange, onCountrySelect }) => {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState(null);
  const [error, setError] = useState(null);
  const [showAllOpportunities, setShowAllOpportunities] = useState(true);
  const debounceTimerRef = useRef(null);

  // Load opportunities from backend JSON (with sample data fallback)
  useEffect(() => {
    const loadOpportunities = async () => {
      // Sample data for testing
      const sampleData = [
        {
          latlon: [40.7128, -74.0060],
          name: "Community Garden Project",
          Link: "https://example.com/garden",
          Country: "United States"
        },
        {
          latlon: [51.5074, -0.1278],
          name: "London Food Bank",
          Link: "https://example.com/foodbank",
          Country: "United Kingdom"
        },
        {
          latlon: [35.6762, 139.6503],
          name: "Tokyo Elderly Care",
          Link: "https://example.com/elderly",
          Country: "Japan"
        },
        {
          latlon: [-23.5505, -46.6333],
          name: "São Paulo Education Initiative",
          Link: "https://example.com/education",
          Country: "Brazil"
        },
        {
          latlon: [28.6139, 77.2090],
          name: "Delhi Clean Water Project",
          Link: "https://example.com/water",
          Country: "India"
        },
        {
          latlon: [52.5200, 13.4050],
          name: "Berlin Refugee Support",
          Link: "https://example.com/refugee",
          Country: "Germany"
        },
        {
          latlon: [-33.8688, 151.2093],
          name: "Sydney Environmental Cleanup",
          Link: "https://example.com/environment",
          Country: "Australia"
        },
        {
          latlon: [19.4326, -99.1332],
          name: "Mexico City Youth Program",
          Link: "https://example.com/youth",
          Country: "Mexico"
        },
        {
          latlon: [55.7558, 37.6173],
          name: "Moscow Homeless Shelter",
          Link: "https://example.com/shelter",
          Country: "Russia"
        },
        {
          latlon: [39.9042, 116.4074],
          name: "Beijing Education Fund",
          Link: "https://example.com/education-fund",
          Country: "China"
        },
        {
          latlon: [-34.6037, -58.3816],
          name: "Buenos Aires Community Center",
          Link: "https://example.com/community",
          Country: "Argentina"
        },
        {
          latlon: [30.0444, 31.2357],
          name: "Cairo Medical Mission",
          Link: "https://example.com/medical",
          Country: "Egypt"
        }
      ];

      try {
        // Try to fetch from backend (optional - will use sample data if fails)
        const response = await fetch('/api/opportunities.json');
        
        if (response.ok) {
          const data = await response.json();
          
          // Handle different JSON formats
          let opportunitiesList = [];
          if (Array.isArray(data)) {
            opportunitiesList = data;
          } else if (data.opportunities && Array.isArray(data.opportunities)) {
            opportunitiesList = data.opportunities;
          } else {
            throw new Error('Invalid JSON format');
          }

          // Validate and normalize opportunities
          const validatedOpportunities = opportunitiesList
            .map((opp, index) => {
              // Handle different field name variations
              const latlon = opp.latlon || opp.latLon || opp.coordinates || opp.coords;
              const name = opp.name || opp.Name || opp.title || opp.Title || `Opportunity ${index + 1}`;
              const link = opp.Link || opp.link || opp.url || opp.URL || '';
              const country = opp.Country || opp.country || opp.location || 'Unknown';

              // Validate latlon
              if (!Array.isArray(latlon) || latlon.length !== 2) {
                console.warn(`Invalid coordinates for opportunity ${index}:`, opp);
                return null;
              }

              const [lat, lng] = latlon;
              if (typeof lat !== 'number' || typeof lng !== 'number') {
                console.warn(`Invalid lat/lng types for opportunity ${index}:`, opp);
                return null;
              }

              return {
                id: opp.id || `opp-${index}`,
                lat,
                lng,
                name,
                link,
                country
              };
            })
            .filter(opp => opp !== null); // Remove invalid entries

          if (validatedOpportunities.length > 0) {
            setOpportunities(validatedOpportunities);
            setError(null);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.log('Backend JSON not available, using sample data:', err.message);
      }

      // Use sample data (either as fallback or primary)
      const validatedSampleData = sampleData.map((opp, index) => ({
        id: `sample-${index}`,
        lat: opp.latlon[0],
        lng: opp.latlon[1],
        name: opp.name,
        link: opp.Link,
        country: opp.Country
      }));

      setOpportunities(validatedSampleData);
      setError(null);
      setLoading(false);
    };

    loadOpportunities();
  }, []);

  // Notify parent when opportunities change
  useEffect(() => {
    if (onOpportunitiesChange && opportunities.length > 0) {
      onOpportunitiesChange(opportunities);
    }
  }, [opportunities, onOpportunitiesChange]);

  // Load initial selected opportunity from database
  useEffect(() => {
    if (!roomCode) return;

    const loadSelectedOpportunity = async () => {
      const { data: room } = await supabase
        .from('rooms')
        .select('selected_opportunity_lat, selected_opportunity_lng')
        .eq('room_code', roomCode)
        .single();

      if (room?.selected_opportunity_lat && room?.selected_opportunity_lng) {
        // Find the opportunity that matches these coordinates
        const matchingOpp = opportunities.find(
          opp => 
            Math.abs(opp.lat - room.selected_opportunity_lat) < 0.01 &&
            Math.abs(opp.lng - room.selected_opportunity_lng) < 0.01
        );
        if (matchingOpp) {
          setSelectedOpportunityId(matchingOpp.id);
          // Only hide other opportunities if this was explicitly selected (not just loaded from DB)
          // We'll keep showAllOpportunities as true on initial load
        }
      }
    };

    if (opportunities.length > 0) {
      loadSelectedOpportunity();
    }
  }, [roomCode, opportunities]);

  // Real-time subscription for opportunity and country selection
  useEffect(() => {
    if (!roomCode) return;

    const channel = supabase
      .channel(`opportunities-${roomCode}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `room_code=eq.${roomCode}`,
        },
        (payload) => {
          const { selected_opportunity_lat, selected_opportunity_lng, selected_country } = payload.new || {};
          const oldSelectedCountry = payload.old?.selected_country;
          
          // Handle country selection changes
          if (selected_country !== oldSelectedCountry) {
            if (selected_country) {
              // Country was selected, show all opportunities in that country
              setShowAllOpportunities(true);
              setSelectedOpportunityId(null);
            } else {
              // Country was cleared
              setShowAllOpportunities(true);
              setSelectedOpportunityId(null);
            }
          }
          
          // Handle opportunity marker (only if no country is selected)
          if (selected_opportunity_lat && selected_opportunity_lng && !selected_country) {
            // Find matching opportunity
            const matchingOpp = opportunities.find(
              opp => 
                Math.abs(opp.lat - selected_opportunity_lat) < 0.01 &&
                Math.abs(opp.lng - selected_opportunity_lng) < 0.01
            );
            if (matchingOpp) {
              setSelectedOpportunityId(matchingOpp.id);
              setShowAllOpportunities(false); // Hide other opportunities
              // Trigger globe update
              if (onOpportunitySelect) {
                onOpportunitySelect(matchingOpp.lat, matchingOpp.lng, matchingOpp.name);
              }
            }
          } else if (!selected_opportunity_lat && !selected_opportunity_lng && !selected_country) {
            // Both cleared
            setSelectedOpportunityId(null);
            setShowAllOpportunities(true);
          }
        }
      )
      .subscribe((status) => {
        console.log('Opportunities subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomCode, opportunities, onOpportunitySelect]);

  const handleTileClick = (opportunity) => {
    // Debounce rapid clicks
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      console.log('Opportunity clicked:', opportunity);
      
      // When clicking an opportunity, select its country instead of just the opportunity
      // This will show all opportunities in that country and pan to it
      if (opportunity.country && onCountrySelect) {
        console.log('Setting country from opportunity:', opportunity.country);
        setShowAllOpportunities(true); // Show all opportunities in the country
        setSelectedOpportunityId(null); // Don't highlight a single opportunity
        
        // Set the country - this will trigger showing all opportunities in that country
        onCountrySelect(opportunity.country);
        
        // Update database to set the country and clear opportunity marker
        if (roomCode) {
          supabase
            .from('rooms')
            .update({
              selected_country: opportunity.country,
              selected_opportunity_lat: null,
              selected_opportunity_lng: null,
            })
            .eq('room_code', roomCode)
            .then(({ error }) => {
              if (error) {
                console.error('Error updating selected country from opportunity:', error);
              } else {
                console.log('Selected country from opportunity updated in database:', opportunity.country);
              }
            });
        }
      } else {
        // Fallback: if no country or callback, use old behavior
        setSelectedOpportunityId(opportunity.id);
        setShowAllOpportunities(false);
        
        if (onOpportunitySelect) {
          onOpportunitySelect(opportunity.lat, opportunity.lng, opportunity.name);
        }
        
        if (roomCode) {
          supabase
            .from('rooms')
            .update({
              selected_opportunity_lat: opportunity.lat,
              selected_opportunity_lng: opportunity.lng,
              selected_country: null,
            })
            .eq('room_code', roomCode);
        }
      }
    }, 100);
  };

  const handleBackClick = () => {
    setShowAllOpportunities(true);
    setSelectedOpportunityId(null);
    
    // Clear opportunity marker from database
    if (roomCode) {
      supabase
        .from('rooms')
        .update({
          selected_opportunity_lat: null,
          selected_opportunity_lng: null,
        })
        .eq('room_code', roomCode);
    }

    // Clear globe marker
    if (onOpportunitySelect) {
      onOpportunitySelect(null, null, null);
    }
  };

  if (loading) {
    return (
      <div className="opportunities-panel">
        <div className="opportunities-header">
          <h3>Opportunities</h3>
        </div>
        <div className="opportunities-loading">
          <p>Loading opportunities...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="opportunities-panel">
        <div className="opportunities-header">
          <h3>Opportunities</h3>
        </div>
        <div className="opportunities-error">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // Helper function to match country names
  // Handles variations between GeoJSON country names and opportunity country names
  const matchCountry = (oppCountry, selectedCountry) => {
    const opp = oppCountry?.toLowerCase().trim() || '';
    const selected = selectedCountry?.toLowerCase().trim() || '';
    
    if (!opp || !selected) return false;
    
    // Direct match
    if (opp === selected) return true;
    
    // Country name mapping for variations
    // Each array contains all valid names for that country
    const countryGroups = [
      ['united states', 'united states of america', 'usa'],
      ['united kingdom', 'uk', 'britain', 'great britain', 'england'],
      ['russia', 'russian federation'],
      ['japan'],
      ['brazil'],
      ['india'],
      ['germany'],
      ['australia'],
      ['mexico'],
      ['china'],
      ['argentina'],
      ['egypt'],
    ];
    
    // Check if both countries are in the same group
    for (const group of countryGroups) {
      const selectedInGroup = group.some(v => v === selected);
      const oppInGroup = group.some(v => v === opp);
      if (selectedInGroup && oppInGroup) {
        return true;
      }
    }
    
    // For multi-word countries, only match if one is a substring of the other
    // This handles "United States" matching "United States of America"
    // But only if the shorter one is completely contained in the longer one
    if (selected.includes(opp) && opp.length >= 5) {
      // "united states" is contained in "united states of america"
      return true;
    }
    if (opp.includes(selected) && selected.length >= 5) {
      // "united states of america" contains "united states"
      return true;
    }
    
    return false;
  };

  // Filter opportunities based on showAllOpportunities state and selected country
  let filteredOpportunities = opportunities;
  
  // If a country is selected, filter by country
  if (selectedCountry) {
    console.log('Filtering opportunities for country:', selectedCountry, 'Total opportunities:', opportunities.length);
    filteredOpportunities = opportunities.filter(opp => {
      const matches = matchCountry(opp.country, selectedCountry);
      console.log(`Checking: "${opp.name}" (${opp.country}) vs "${selectedCountry}" = ${matches}`);
      return matches;
    });
    console.log(`Filtered to ${filteredOpportunities.length} opportunities for country: ${selectedCountry}`);
    console.log('Filtered opportunities:', filteredOpportunities.map(o => ({ name: o.name, country: o.country })));
  }
  
  // Then apply showAllOpportunities filter
  const displayedOpportunities = showAllOpportunities 
    ? filteredOpportunities 
    : filteredOpportunities.filter(opp => opp.id === selectedOpportunityId);

  return (
    <div className="opportunities-panel">
      <div className="opportunities-header">
        <h3>Opportunities</h3>
        {!showAllOpportunities && (
          <button 
            className="back-button"
            onClick={handleBackClick}
            title="Back to all opportunities"
          >
            ← Back
          </button>
        )}
        {showAllOpportunities && (
          <span className="opportunities-count">
            {selectedCountry ? filteredOpportunities.length : opportunities.length}
          </span>
        )}
      </div>
      
      <div className="opportunities-list">
        {displayedOpportunities.length === 0 ? (
          <div className="opportunities-empty">
            <p>No opportunities available.</p>
          </div>
        ) : (
          displayedOpportunities.map((opp) => (
            <div
              key={opp.id}
              className={`opportunity-tile ${selectedOpportunityId === opp.id ? 'selected' : ''}`}
              onClick={() => handleTileClick(opp)}
            >
              <div className="opportunity-title">{opp.name}</div>
              <div className="opportunity-country">{opp.country}</div>
              {opp.link && (
                <a
                  href={opp.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opportunity-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  Learn more →
                </a>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default OpportunitiesPanel;

